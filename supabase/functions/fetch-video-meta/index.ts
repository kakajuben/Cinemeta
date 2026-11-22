import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authorization = req.headers.get('authorization');
    const tokenMatch = authorization?.match(/^Bearer\s+([\w.-]+)$/i);
    const databaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    if (!tokenMatch || !databaseUrl || !publishableKey) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = databaseUrl.replace(/\/+$/, '');
    const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${tokenMatch[1]}` },
    });
    if (!userResponse.ok) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = await userResponse.json();
    if (typeof user?.id !== 'string') {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rolesUrl = new URL(`${baseUrl}/rest/v1/user_roles`);
    rolesUrl.searchParams.set('select', 'role');
    rolesUrl.searchParams.set('user_id', `eq.${user.id}`);
    rolesUrl.searchParams.set('role', 'eq.admin');
    rolesUrl.searchParams.set('limit', '1');
    const roleResponse = await fetch(rolesUrl, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${tokenMatch[1]}` },
    });
    if (!roleResponse.ok || (await roleResponse.json()).length === 0) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (contentLength > 512) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const rawBody = await req.text();
    if (rawBody.length > 512) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body: unknown = JSON.parse(rawBody);
    const videoId =
      body && typeof body === 'object' && 'videoId' in body && typeof body.videoId === 'string'
        ? body.videoId
        : '';
    if (!/^vi\d{7,10}$/i.test(videoId)) {
      return new Response(JSON.stringify({ error: 'Invalid IMDb video ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imdbUrl = `https://www.imdb.com/video/${videoId}/`;
    
    // Server-side fetch bypassing CORS
    const res = await fetch(imdbUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`IMDb returned status: ${res.status}`);
    const html = await res.text();

    // Extract OpenGraph tags
    const titleMatch = html.match(/<meta property="og:title" content="(.*?)"/i);
    const imageMatch = html.match(/<meta property="og:image" content="(.*?)"/i);

    let rawTitle = titleMatch ? titleMatch[1] : "IMDb Video";
    rawTitle = rawTitle.replace(/ - IMDb$/i, "").trim();
    const thumbnail = imageMatch ? imageMatch[1] : "";

    return new Response(JSON.stringify({
      id: videoId,
      title: rawTitle,
      thumbnail: thumbnail,
      embedUrl: `https://www.imdb.com/video/imdb/${videoId}/imdb/embed?autoplay=false`,
      originalUrl: imdbUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Could not load video metadata' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
