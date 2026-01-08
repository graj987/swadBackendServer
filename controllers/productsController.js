import productModel from "../models/productModel.js";
const Product = productModel;

export const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products" });
  }
};

export const featuredProducts = async (req, res) => {
  try {
    const products = await Product.find({ featured: true });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching featured products" });
  } 
};


export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Error fetching product" });
  }
};


export const getProductsCount = async (req, res) => {
  try {
    const count = await Product.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error("getProductsCount:", err);
    res.status(500).json({ message: "Failed to fetch products count", error: err.message });
  }
};

export const searchProducts = async (req, res) => {
  try {
    const query = req.query.query;

    if (!query || query.trim() === "") {
      return res.json([]);
    }

    const results = await Product.find(
      {
        name: { $regex: query, $options: "i" }
      },
      "name image price _id category"
    )
      .limit(10)
      .lean();

    res.json(results);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
};

export const whishlist = async (req, res)=>{
  try {
    
    
  } catch (error) {
    
  }

}