import axios from "axios";

export const reverseGeocode = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude required",
      });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

    const response = await axios.get(url, {
      headers: { "User-Agent": "SwadBest-App" },
    });

    const a = response.data.address || {};

    return res.json({
      success: true,
      address: {
        house: a.house_number || "",
        street: a.road || "",
        area: a.suburb || a.neighbourhood || "",
        city: a.city || a.town || a.village || "",
        state: a.state || "",
        pincode: a.postcode || "",
      },
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch address",
    });
  }
};
