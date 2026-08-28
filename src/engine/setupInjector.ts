/**
 * Setup Injector Utility for Standalone Offline HTML Bundles
 *
 * Allows pre-baking vault credentials, workspace configs, and relay backend URLs
 * directly into standalone git-chat.html downloads for frictionless local use.
 */

export interface EmbeddedSetupPayload {
  owner?: string;
  repo?: string;
  branch?: string;
  password?: string;
  workspaceSecret?: string;
  backendUrl?: string;
  lanUrl?: string;
  token?: string;
  user?: {
    id?: string;
    name?: string;
    avatar?: string;
    role?: string;
  };
  [key: string]: any;
}

const EMBEDDED_TAG_REGEX = /<script\s+id=["']embedded-setup-config["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i;

/**
 * Injects or updates an embedded setup config block inside an HTML document string.
 */
export function injectSetupIntoHtml(
  htmlContent: string,
  setupPayload: EmbeddedSetupPayload
): string {
  const jsonString = JSON.stringify(setupPayload, null, 2);
  const scriptBlock = `<script id="embedded-setup-config" type="application/json">\n${jsonString}\n</script>`;

  if (EMBEDDED_TAG_REGEX.test(htmlContent)) {
    return htmlContent.replace(EMBEDDED_TAG_REGEX, scriptBlock);
  }

  // Insert right before </head> if present
  const headIndex = htmlContent.toLowerCase().indexOf('</head>');
  if (headIndex !== -1) {
    return (
      htmlContent.slice(0, headIndex) +
      '  ' +
      scriptBlock +
      '\n' +
      htmlContent.slice(headIndex)
    );
  }

  // Fallback: prepend to beginning of document
  return scriptBlock + '\n' + htmlContent;
}

/**
 * Extracts and parses any pre-configured embedded setup block from an HTML string.
 */
export function extractEmbeddedSetup(
  htmlContent: string
): EmbeddedSetupPayload | null {
  const match = htmlContent.match(EMBEDDED_TAG_REGEX);
  if (!match || !match[1]) {
    return null;
  }

  try {
    const rawJson = match[1].trim();
    return JSON.parse(rawJson) as EmbeddedSetupPayload;
  } catch (err) {
    console.warn('Failed to parse embedded setup JSON:', err);
    return null;
  }
}
