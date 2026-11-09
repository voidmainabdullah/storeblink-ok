import { useRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useThemeMobileMenu } from "./useThemeMobileMenu";

const MobileMenuHarness = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const menu = useThemeMobileMenu(containerRef);

  return (
    <>
      <div ref={containerRef}>
        <button
          type="button"
          data-theme-chrome-slot="mobile-menu-trigger"
          aria-expanded={menu.open}
          onClick={menu.toggle}
        >
          Menu
        </button>
        {menu.open ? (
          <nav data-theme-chrome-slot="mobile-menu" tabIndex={-1}>
            <a href="/first" onClick={(event) => event.preventDefault()}>
              First link
            </a>
            <button type="button">Last action</button>
          </nav>
        ) : null}
      </div>
      <button type="button">Outside</button>
    </>
  );
};

describe("useThemeMobileMenu", () => {
  it("locks scrolling, manages focus, traps Tab, and restores the trigger", async () => {
    render(<MobileMenuHarness />);
    const trigger = screen.getByRole("button", { name: "Menu" });

    fireEvent.click(trigger);

    const first = screen.getByRole("link", { name: "First link" });
    const last = screen.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(first).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");

    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("navigation"),
      ).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(document.body.style.overflow).toBe("");
    });
  });

  it("closes on outside pointer input and on navigation", async () => {
    render(<MobileMenuHarness />);
    const trigger = screen.getByRole("button", { name: "Menu" });

    fireEvent.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "First link" })).toHaveFocus(),
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() =>
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument(),
    );

    fireEvent.click(trigger);
    const link = await screen.findByRole("link", { name: "First link" });
    fireEvent.click(link);
    await waitFor(() =>
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument(),
    );
  });
});
