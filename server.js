const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Environment variables
const MODEL_ACCESS_KEY = process.env.MODEL_ACCESS_KEY;
const API_BASE_URL = 'https://inference.do-ai.run/v1';

// Generate image endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, num_inference_steps = 4, guidance_scale = 3.5, num_images = 1 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!MODEL_ACCESS_KEY) {
      return res.status(500).json({ error: 'MODEL_ACCESS_KEY is not configured' });
    }

    // Step 1: Invoke the async request
    const invokeResponse = await axios.post(
      `${API_BASE_URL}/async-invoke`,
      {
        model_id: 'fal-ai/fast-sdxl',
        input: {
          prompt,
          output_format: 'landscape_4_3',
          num_inference_steps,
          guidance_scale,
          num_images,
          enable_safety_checker: true
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${MODEL_ACCESS_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const requestId = invokeResponse.data.request_id;
    console.log(`Image generation started with request_id: ${requestId}`);

    // Step 2: Poll for completion
    let status = 'PENDING';
    let attempts = 0;
    const maxAttempts = 120; // Maximum 120 attempts (120 seconds / 2 minutes)
    const pollInterval = 1000; // Poll every 1 second

    console.log(`Starting to poll for request_id: ${requestId}`);

    while (status !== 'COMPLETE' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const statusResponse = await axios.get(
          `${API_BASE_URL}/async-invoke/${requestId}/status`,
          {
            headers: {
              'Authorization': `Bearer ${MODEL_ACCESS_KEY}`
            }
          }
        );

        status = statusResponse.data.status;
        attempts++;

        console.log(`Attempt ${attempts}: Status = ${status}`);

        if (status === 'FAILED') {
          console.error('Generation failed:', statusResponse.data);
          return res.status(500).json({ 
            error: 'Image generation failed',
            details: statusResponse.data.error || 'Unknown error'
          });
        }
      } catch (pollError) {
        console.error(`Polling error on attempt ${attempts}:`, pollError.message);
        // Continue polling even if one attempt fails
        attempts++;
      }
    }

    if (status !== 'COMPLETE') {
      console.error(`Request timed out after ${attempts} attempts`);
      return res.status(408).json({ 
        error: `Request timed out after ${attempts} seconds. The image may still be generating. Try again in a moment.`,
        request_id: requestId
      });
    }

    // Step 3: Get the final result
    const resultResponse = await axios.get(
      `${API_BASE_URL}/async-invoke/${requestId}`,
      {
        headers: {
          'Authorization': `Bearer ${MODEL_ACCESS_KEY}`
        }
      }
    );

    console.log('Image generation complete!');
    console.log('Result:', JSON.stringify(resultResponse.data, null, 2));

    res.json({
      success: true,
      data: resultResponse.data
    });

  } catch (error) {
    console.error('Error generating image:');
    console.error('Message:', error.message);
    console.error('Response:', error.response?.data);
    console.error('Status:', error.response?.status);
    
    res.status(500).json({
      error: 'Failed to generate image',
      details: error.response?.data?.error || error.message,
      status: error.response?.status
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Test API key endpoint
app.get('/api/test', async (req, res) => {
  try {
    if (!MODEL_ACCESS_KEY) {
      return res.status(500).json({ 
        error: 'MODEL_ACCESS_KEY not configured',
        configured: false 
      });
    }

    // Try a simple test request
    const testResponse = await axios.post(
      `${API_BASE_URL}/async-invoke`,
      {
        model_id: 'fal-ai/fast-sdxl',
        input: {
          prompt: 'test',
          num_inference_steps: 1
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${MODEL_ACCESS_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      message: 'API key is valid and working',
      request_id: testResponse.data.request_id,
      configured: true
    });
  } catch (error) {
    res.status(500).json({
      error: 'API test failed',
      details: error.response?.data || error.message,
      status: error.response?.status,
      configured: !!MODEL_ACCESS_KEY
    });
  }
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
