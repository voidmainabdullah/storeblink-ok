export const PRODUCTION_ORIGIN = "https://storeblink.com";

export const productionUrl = (path: string): string =>
  new URL(path, `${PRODUCTION_ORIGIN}/`).toString();
