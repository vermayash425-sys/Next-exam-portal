// netlify/functions/ask-ai.js
//
// This is a Netlify serverless function. It keeps the Anthropic API key
// safely on the server side (never exposed to the browser/student) and
// acts as a secure relay between the exam portal and Claude.
//
// SETUP:
// 1. In your GitHub repo, create this exact folder structure:
//      netlify/functions/ask-ai.js   <-- this file goes here
// 2. In Netlify: Site settings -> Environment variables -> add
//      ANTHROPIC_API_KEY = <your key>
// 3. Netlify auto-detects functions in netlify/functions/ - no extra config needed.
// 4. Once deployed, this function is reachable at:
//      https://<your-site>.netlify.app/.netlify/functions/ask-ai

exports.handler = async function (event) {
  // CORS headers so the browser is allowed to call this function
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { mode, context, question, history } = JSON.parse(event.body || '{}');

    if (!process.env.ANTHROPIC_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY. Set it in Netlify environment variables.' }) };
    }

    // Two modes:
    // 1. "guidance" -> one-shot personalized study advice based on the
    //    student's real score/subject data (no back-and-forth needed).
    // 2. "doubt" -> a chat-style Q&A where the student can ask follow-up
    //    questions about their exam/subjects.
    let systemPrompt = '';
    let userMessage = '';

    if (mode === 'guidance') {
      systemPrompt = `You are an experienced, encouraging FMGE/NEET-PG exam mentor for Indian medical graduates preparing for licensing exams. You give short, specific, actionable study guidance based on a student's actual test performance data. Keep your tone warm and motivating, never harsh. Structure your answer in 3 short parts: (1) One encouraging sentence acknowledging their current level, (2) 2-3 concrete, specific next steps (name actual weak subjects from their data, suggest revision + daily practice + attending "Test & Discussion (T&D)" sessions where concepts get cleared), (3) One short motivating closing line. Keep the whole thing under 120 words. Do not use markdown headers, just flowing short paragraphs or a short bullet list.`;
      userMessage = `Here is my latest test performance data:\n${context}\n\nGive me personalized guidance on what I should do next.`;
    } else {
      systemPrompt = `You are a helpful, patient FMGE/NEET-PG exam mentor for Indian medical graduates. Students ask you doubts about their exam performance, specific subjects, or general exam strategy. Answer clearly and concisely (under 150 words unless the question genuinely needs more). Use simple language. If asked a pure medical/clinical knowledge question, answer accurately and briefly, then suggest they cross-check with a standard textbook for exam purposes. Be warm and encouraging.`;
      userMessage = question;
    }

    const messages = [];
    if (mode === 'doubt' && Array.isArray(history)) {
      history.forEach(h => messages.push({ role: h.role, content: h.content }));
    }
    messages.push({ role: 'user', content: userMessage });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || 'AI request failed' }) };
    }

    const text = (data.content || []).map(b => b.text || '').join('\n').trim();

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
