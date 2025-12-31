export const calculateDeliveryCharge = (region) => {
  switch (region) {
    case "local":
      return 30;
    case "metro":
      return 50;
    case "remote":
      return 70;
    default:
      return 100;
  }
};
