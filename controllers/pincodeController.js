import axios from "axios";

export const lookupPincode = async (req, res) => {
  try {
    const { pincode } = req.params;

    // Validate format
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid 6-digit pincode",
      });
    }

    // Call India Post API
    const url = `https://api.postalpincode.in/pincode/${pincode}`;
    const { data } = await axios.get(url);

    if (!data || data[0].Status !== "Success") {
      return res.status(404).json({
        success: false,
        message: "Pincode not serviceable",
      });
    }

    const office = data[0].PostOffice[0];

    const city = office.District;
    const state = office.State;

    // REGION LOGIC (Required for delivery charges)
    let region = "metro";

    const metroCities = [
      "Delhi",
      "Mumbai",
      "Chennai",
      "Kolkata",
      "Bengaluru",
      "Hyderabad",
      "Pune",
      "Ahmedabad"
    ];

    if (metroCities.includes(city)) region = "metro";
    else if (["Bihar", "UP", "Jharkhand"].includes(state)) region = "local";
    else region = "remote";

    res.json({
      success: true,
      city,
      state,
      region,
      isServiceable: true,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Pincode lookup failed",
    });
  }
};
