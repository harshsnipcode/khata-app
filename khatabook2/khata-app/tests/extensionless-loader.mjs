export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      context?.parentURL &&
      specifier.startsWith(".") &&
      !specifier.endsWith(".js") &&
      !specifier.endsWith(".json") &&
      !specifier.endsWith(".mjs")
    ) {
      try {
        return await nextResolve(`${specifier}.js`, context);
      } catch {
        return nextResolve(new URL(specifier, context.parentURL).href + "/index.js", context);
      }
    }
    throw error;
  }
}