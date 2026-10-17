import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Testing with API key present:', !!apiKey);
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });

  const buf = fs.readFileSync('public/pwa-192x192.png');
  const base64Data = buf.toString('base64');

  try {
    console.log('Calling generateContent...');
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          parts: [
            { text: 'Describe what you see in this image in one sentence in Spanish.' },
            { inlineData: { mimeType: 'image/png', data: base64Data } }
          ]
        }
      ]
    });
    console.log('Response text:', response.text);
  } catch (err) {
    console.error('Error occurred:', err);
  }
}

test();
