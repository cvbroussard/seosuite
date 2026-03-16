/**
 * Redirect instruction generator — provides platform-specific
 * redirect rules for SEO migration from old blog to TracPost.
 */

export interface RedirectInstructions {
  sourcePath: string;
  targetDomain: string;
  platforms: PlatformRedirect[];
}

export interface PlatformRedirect {
  platform: string;
  label: string;
  instructions: string;
  code: string;
}

/**
 * Generate redirect instructions for all supported platforms.
 */
export function generateRedirectInstructions(
  sourcePath: string,
  targetDomain: string
): RedirectInstructions {
  const src = sourcePath.replace(/\/+$/, "");
  const target = targetDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  return {
    sourcePath: src,
    targetDomain: target,
    platforms: [
      wordpress(src, target),
      shopify(src, target),
      squarespace(src, target),
      vercel(src, target),
      netlify(src, target),
      nginx(src, target),
      htaccess(src, target),
    ],
  };
}

function wordpress(src: string, target: string): PlatformRedirect {
  return {
    platform: "wordpress",
    label: "WordPress",
    instructions:
      "Add this to your .htaccess file in the site root, OR install the 'Redirection' plugin and add a single redirect rule with the regex pattern below.",
    code: `# Add to .htaccess
RewriteEngine On
RewriteRule ^${src.replace(/^\//, "")}/(.*) https://${target}/$1 [R=301,L]`,
  };
}

function shopify(src: string, target: string): PlatformRedirect {
  return {
    platform: "shopify",
    label: "Shopify",
    instructions:
      "Shopify doesn't support wildcard redirects. Go to Settings → Navigation → URL Redirects and add each post individually. You can bulk-import via CSV with columns: Redirect from, Redirect to.",
    code: `# CSV format for Shopify bulk redirect import:
# Redirect from, Redirect to
${src}/your-post-slug, https://${target}/your-post-slug

# Repeat for each post. TracPost exported your slugs above.`,
  };
}

function squarespace(src: string, target: string): PlatformRedirect {
  return {
    platform: "squarespace",
    label: "Squarespace",
    instructions:
      "Go to Settings → Advanced → URL Mappings and add the redirect rule below. Squarespace supports wildcard patterns.",
    code: `${src}/[slug] -> https://${target}/[slug] 301`,
  };
}

function vercel(src: string, target: string): PlatformRedirect {
  return {
    platform: "vercel",
    label: "Vercel",
    instructions: "Add this to your vercel.json in the project root.",
    code: JSON.stringify(
      {
        redirects: [
          {
            source: `${src}/:slug*`,
            destination: `https://${target}/:slug*`,
            permanent: true,
          },
        ],
      },
      null,
      2
    ),
  };
}

function netlify(src: string, target: string): PlatformRedirect {
  return {
    platform: "netlify",
    label: "Netlify",
    instructions:
      "Add this line to your _redirects file in the site root (or create one).",
    code: `${src}/*  https://${target}/:splat  301`,
  };
}

function nginx(src: string, target: string): PlatformRedirect {
  return {
    platform: "nginx",
    label: "Nginx",
    instructions:
      "Add this to your nginx server block configuration.",
    code: `location ${src}/ {
    return 301 https://${target}$request_uri;
}`,
  };
}

function htaccess(src: string, target: string): PlatformRedirect {
  return {
    platform: "htaccess",
    label: "Apache (.htaccess)",
    instructions:
      "Add this to your .htaccess file in the site root.",
    code: `RewriteEngine On
RewriteRule ^${src.replace(/^\//, "")}/(.*) https://${target}/$1 [R=301,L]`,
  };
}
