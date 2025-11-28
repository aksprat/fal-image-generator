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

    // Step 2: Poll for completion
    let status = 'PENDING';
    let attempts = 0;
    const maxAttempts = 60; // Maximum 60 attempts (60 seconds)

    while (status !== 'COMPLETE' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

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

      if (status === 'FAILED') {
        return res.status(500).json({ error: 'Image generation failed' });
      }
    }

    if (status !== 'COMPLETE') {
      return res.status(408).json({ error: 'Request timed out' });
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

    res.json({
      success: true,
      data: resultResponse.data
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to generate image',
      details: error.response?.data || error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
