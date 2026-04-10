/**
 * Cloudflare Worker: Blog Proxy
 *
 * Deployed on: blogs.tracpost.com
 * Purpose: Receive requests for tenant custom blog domains,
 *          rewrite Host to tracpost.com, and pass the original
 *          hostname via x-custom-blog-host header.
 *
 * Tenant DNS: blog.b2construct.com CNAME blogs.tracpost.com
 * This worker intercepts, rewrites, and forwards to our Vercel origin.
 */

const ORIGIN = "tracpost.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const originalHost = url.hostname;

    // If someone hits blogs.tracpost.com directly (not a custom domain),
    // redirect to the main blog
    if (originalHost === "blogs.tracpost.com") {
      return Response.redirect("https://tracpost.com/blog", 302);
    }

    // Rewrite to our Vercel-hosted origin
    url.hostname = ORIGIN;

    const modifiedRequest = new Request(url, {
      method: request.method,
      headers: new Headers(request.headers),
      body: request.body,
      redirect: "manual",
    });

    // Pass the original custom domain so middleware can resolve the site
    modifiedRequest.headers.set("x-custom-blog-host", originalHost);
    // Override Host header to match what Vercel expects
    modifiedRequest.headers.set("Host", ORIGIN);

    const response = await fetch(modifiedRequest);

    // Clone response and add CORS/cache headers if needed
    const modifiedResponse = new Response(response.body, response);

    // Remove any Vercel-specific headers the tenant shouldn't see
    modifiedResponse.headers.delete("x-vercel-id");
    modifiedResponse.headers.delete("x-vercel-cache");

    return modifiedResponse;
  },
};
