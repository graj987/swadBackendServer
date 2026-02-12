import mongoose from "mongoose";

/* ================= VARIANT SCHEMA ================= */

const variantSchema = new mongoose.Schema(
  {
    weight: {
      type: String, // e.g. "250 g", "500 g", "1 kg"
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
            // allow null when not hero
            if (v === null) return !this.isHero;
            return Number.isInteger(v);
          },
          message: "heroVariantIndex must be an integer or null",
        },
        {
          validator: function (v) {
            // if hero → index must exist
            if (this.isHero) return v !== null;
            return true;
          },
          message: "heroVariantIndex is required when product is hero",
        },
      ],
    },

    /* ================= FEATURED ================= */
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* ================= DEAL OF THE DAY ================= */
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

      startAt: {
        type: Date,
      },

      endAt: {
        type: Date,
      },
    },

    /* ================= META ================= */

    ratings: {
      type: Number,
      default: 0,
    },

    numReviews: {
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

/* ================= INDEXES ================= */
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
productSchema.methods.getFinalPrice = function (basePrice) {
  if (this.isDealActive && this.deal?.discountPercent) {
    return Math.round(
      basePrice - (basePrice * this.deal.discountPercent) / 100
    );
  }
  return basePrice;
};


productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });


// Text search
productSchema.index({ name: "text", category: "text" });

// Ensure ONLY ONE hero product exists
productSchema.index(
  { isHero: 1 },
  { unique: true, partialFilterExpression: { isHero: true } },
);

/* ================= MODEL EXPORT ================= */

const Product = mongoose.model("Product", productSchema);
export default Product;
