const allowedTransitions = {
  Pending: ["Shipped"],
  Shipped: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

const canTransitionOrder = (currentStatus, nextStatus) =>
  allowedTransitions[currentStatus]?.includes(nextStatus) || false;

module.exports = { allowedTransitions, canTransitionOrder };
