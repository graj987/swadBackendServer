
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/feed", async (req, res) => {
  try {
    const token = process.env.IG_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.instagram.com/me/media?fields=id,media_type,media_url,permalink&access_token=${token}`
    );

    const data = await response.json();

    const images = data.data
      .filter(
        (post) =>
          post.media_type === "IMAGE" || post.media_type === "CAROUSEL_ALBUM"
      )
      .slice(0, 6);

    res.json(images);
  } catch (err) {
    res.status(500).json({ error: "Instagram fetch failed" });
  }
});

export default router;
