require('dotenv').config();

const { runFullPipeline } = require('./pipeline');

runFullPipeline()
  .then((result) => {
    console.log('Manual cycle result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error('Manual cycle failed:', error);
    process.exit(1);
  });
