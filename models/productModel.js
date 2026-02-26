import mongoose from "mongoose";

/* ================= VARIANT SCHEMA ================= */

const variantSchema = new mongoose.Schema(
  {
    weight: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    rating: { type: Number, required: true },
    comment: { type: String, required: true },
  },
  { timestamps: true },
);

/* ================= PRODUCT SCHEMA ================= */

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String,
      default: "",
    },

    variants: {
      type: [variantSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one variant is required",
      },
    },

    /* ================= HERO CONFIG ================= */

    isHero: {
      type: Boolean,
      default: false,
    },

    heroVariantIndex: {
      type: Number,
      default: null,
      min: 0,
      validate: [
        {
          validator: function (v) {
            if (!this.isHero) return v === null;
            return (
              Number.isInteger(v) &&
              v >= 0 &&
              this.variants &&
              v < this.variants.length
            );
          },
          message:
            "heroVariantIndex must be valid index of variants when product is hero",
        },
      ],
    },

    /* ================= FEATURED ================= */

    isFeatured: {
      type: Boolean,
      default: false,
    },

    /* ================= DEAL ================= */

    deal: {
      isActive: {
        type: Boolean,
        default: false,
      },

      discountPercent: {
        type: Number,
        min: 1,
        max: 90,
      },

      startAt: Date,
      endAt: Date,
    },

    /* ================= META ================= */

    reviews: [reviewSchema],
    numReviews: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

/* ================= VIRTUALS ================= */

productSchema.virtual("isDealActive").get(function () {
  if (!this.deal?.isActive) return false;

  const now = new Date();
  return (
    this.deal.startAt &&
    this.deal.endAt &&
    now >= this.deal.startAt &&
    now <= this.deal.endAt
  );
});

/* ================= METHODS ================= */

productSchema.methods.getFinalPrice = function (basePrice) {
  if (this.isDealActive && this.deal?.discountPercent) {
    return Math.round(
      basePrice - (basePrice * this.deal.discountPercent) / 100,
    );
  }
  return basePrice;
};

/* ================= JSON SETTINGS ================= */

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

/* ================= INDEXES ================= */

// ONE text index only
productSchema.index({
  name: "text",
  category: "text",
  description: "text",
});

// Hero unique partial index
productSchema.index(
  { isHero: 1 },
  { unique: true, partialFilterExpression: { isHero: true } },
);

// Query optimization indexes
productSchema.index({ isFeatured: 1 });
productSchema.index({ category: 1 });
productSchema.index({ isAvailable: 1 });
productSchema.index({ "deal.isActive": 1 });

/* ================= MODEL ================= */

const Product = mongoose.model("Product", productSchema);
export default Product;
