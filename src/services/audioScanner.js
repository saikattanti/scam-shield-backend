const axios = require('axios');

/**
 * Uses Gemini 1.5 Flash native audio support to transcribe a phone call.
 * This keeps all audio processing in RAM (privacy by design).
 * 
 * @param {Buffer} audioBuffer - Memory buffer of the uploaded audio file
 * @param {string} mimeType - e.g. 'audio/mpeg', 'audio/wav'
 * @returns {Promise<string>} The transcribed text
 */
const transcribeAudio = async (audioBuffer, mimeType = 'audio/mpeg') => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Required for audio transcription.');
  }

  // Convert buffer to base64
  const base64Audio = audioBuffer.toString('base64');

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey.trim()}`,
      {
        contents: [
          {
            parts: [
              {
                text: "You are a professional transcriber. Transcribe this phone call word-for-word accurately. Do not add any extra commentary or headers. Just output the transcription in its original language (e.g., Hindi, English, etc.)."
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Audio
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1, // low temp for accurate transcription
          maxOutputTokens: 1024,
        }
      },
      { 
        timeout: 25000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini returned an empty transcription.");
    }

    console.log(`✅ Audio successfully transcribed. Length: ${text.length} chars.`);
    return text.trim();
  } catch (error) {
    console.error('Audio Transcription Error:', error.response?.data || error.message);
    throw new Error('Our AI failed to transcribe the call. Ensure it is a clear speech recording under 5MB.');
  }
};

module.exports = { transcribeAudio };
