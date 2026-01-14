// import mongoose from "mongoose";

// const productSchema = new mongoose.Schema(
//   {
    
//     name: {
//       type: String,
//       required: [true, "Product name is required"],
//       trim: true,
//     },
//     description: {
//       type: String,
//       required: [true, "Product description is required"],
//     },
//     category: {
//       type: String,
//       required: true,
//       trim: true,
//     },
//     weight:{
//       type: Number,
//     },

//     price: {
//       type: Number,
//       required: [true, "Product price is required"],
//     },
//     image: {
//       type: String,
//       default: "",
//     },
//     stock: {
//       type: Number,
//       required: true,
//       min: 0,
//     },
//     isAvailable: {
//       type: Boolean,
//       default: true,
//     },
//     ratings: {
//       type: Number,
//       default: 0,
//     },
//     numReviews: {
//       type: Number,
//       default: 0,
//     },
//     featured: {
//       type: Boolean,
//       default: false,
//     },
//   },
//   { timestamps: true }
// );

// productSchema.index({ name: "text", category: "text" });

// const Product = mongoose.model("Product", productSchema);

// export default Product;
import mongoose from "mongoose";

const variantSchema = new mongoose.Schema(
  {
    weight: {
      type: String, // "250 g", "500 g", "1 kg"
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

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
      validate: v => v.length > 0,
    },

    /* HERO CONFIG */
    isHero: {
      type: Boolean,
      default: false,
    },

    heroVariantIndex: {
      type: Number,
      default: 0,
    },

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
  { timestamps: true }
);

productSchema.index({ name: "text", category: "text" });

const Product = mongoose.model("Product", productSchema);
export default Product;

