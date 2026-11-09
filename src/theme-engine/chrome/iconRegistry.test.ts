import { describe, expect, it } from "vitest";
import {
  loadThemeIconCatalog,
  resolveThemeIcon,
  type ThemeIconLibrary,
} from "./index";

describe("theme icon registry", () => {
  const iconCases: Array<[ThemeIconLibrary, string]> = [
    ["heroicons", "UserIcon"],
    ["phosphor", "MagnifyingGlass"],
    ["tabler", "IconShoppingCart"],
    ["react-icons", "FiHome"],
    ["react-icons", "FaHouse"],
    ["react-icons", "MdHome"],
  ];

  it.each(iconCases)("lazy-loads %s icons", async (library, name) => {
    const component = await resolveThemeIcon(library, name);
    const catalog = await loadThemeIconCatalog(library);

    expect(component).toBeTruthy();
    expect(catalog).toContain(name);
  }, 20_000);
});
