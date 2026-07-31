let ioInstance = null;

const setIO = (io) => {
  ioInstance = io;
};

const getIO = () => {
  if (!ioInstance) {
    throw new Error("Socket.io instance is not initialized yet.");
  }
  return ioInstance;
};

module.exports = { setIO, getIO };
