/**
 * Simple test script to start the API server
 */

console.log('Step 1: Starting test...');

try {
  console.log('Step 2: Loading APIServer...');
  const { APIServer } = require('./src/api/server.ts');

  console.log('Step 3: Creating server instance...');
  const server = new APIServer();

  console.log('Step 4: Starting server...');
  server.start()
    .then(() => {
      console.log('✅ Server started successfully on port 3000');
      console.log('Open http://localhost:3000 in your browser');
    })
    .catch((error: Error) => {
      console.error('❌ Failed to start server:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
} catch (error: any) {
  console.error('❌ Error loading server:', error.message);
  console.error(error.stack);
  process.exit(1);
}
