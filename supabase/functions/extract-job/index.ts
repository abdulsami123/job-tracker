// supabase/functions/extract-job/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import OpenAI from 'npm:openai@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JOB_SCHEMA = {
  name: 'job_fields',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      company: { type: 'string' },
      position: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['company', 'position', 'description'],
  },
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function extractWithRetry(openai: OpenAI, pageText: string) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You extract structured data from a job posting page. Return company (the hiring employer name), ' +
              'position (the job title), and description (the job description as plain text). ' +
              'If a field is genuinely absent, return an empty string.',
          },
          { role: 'user', content: pageText.slice(0, 12000) },
        ],
        response_format: { type: 'json_schema', json_schema: JOB_SCHEMA },
      });
      return JSON.parse(completion.choices[0].message.content ?? '{}');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    // Require an authenticated Supabase user.
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const pageText = body?.pageText;
    if (typeof pageText !== 'string' || pageText.length < 20) {
      return json({ error: 'pageText required' }, 400);
    }

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
    const fields = await extractWithRetry(openai, pageText);
    return json(fields, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
