module.exports = async (req, res) => {
  res.status(410).json({
    error: 'Legacy /api/run-cycle.js is retired. Use app/api/run-cycle/route.ts runtime path.',
  });
};
