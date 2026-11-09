import { useEffect, useMemo, useState } from "react";
import { Code2, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  compileCustomCode,
  createDefaultCustomCodeProps,
  parseCustomCodeProps,
  type CustomCodeLanguage,
} from "@/extension/custom-code";
import type { SceneNode } from "@/types";
import { InspectorSection } from "./InspectorControls";

export const CustomCodeInspector = ({
  node,
  onUpdateProps,
}: {
  node: SceneNode;
  onUpdateProps: (patch: Record<string, unknown>) => void;
}) => {
  const persisted = useMemo(() => parseCustomCodeProps(node.props), [node.props]);
  const [activeEditor, setActiveEditor] = useState<"tsx" | "css">("tsx");
  const [language, setLanguage] = useState<CustomCodeLanguage>(persisted.language);
  const [source, setSource] = useState(persisted.source);
  const [css, setCss] = useState(persisted.css);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSource(persisted.source);
    setCss(persisted.css);
    setLanguage(persisted.language);
    setError(null);
  }, [persisted.css, persisted.language, persisted.source]);

  const dirty = source !== persisted.source || css !== persisted.css || language !== persisted.language;
  const apply = async () => {
    setCompiling(true);
    setError(null);
    try {
      const next = await compileCustomCode(source, css, persisted, language);
      onUpdateProps(next);
    } catch (compileError) {
      setError(
        compileError instanceof Error
          ? compileError.message
          : "The custom section could not be compiled.",
      );
    } finally {
      setCompiling(false);
    }
  };

  const reset = () => {
    const defaults = createDefaultCustomCodeProps();
    setSource(defaults.source);
    setCss(defaults.css);
    setLanguage(defaults.language);
    setError(null);
  };

  return (
    <InspectorSection title="Custom code">
      <div className="grid grid-cols-2 rounded border border-[#4a4a4a] bg-[#242424] p-0.5">
        <button
          type="button"
          aria-pressed={activeEditor === "tsx"}
          onClick={() => setActiveEditor("tsx")}
          className={`h-7 rounded text-[10px] font-medium ${activeEditor === "tsx" ? "bg-[#0178ff] text-white" : "text-[#b8b8b8] hover:bg-white/10"}`}
        >
          React / TypeScript
        </button>
        <button
          type="button"
          aria-pressed={activeEditor === "css"}
          onClick={() => setActiveEditor("css")}
          className={`h-7 rounded text-[10px] font-medium ${activeEditor === "css" ? "bg-[#0178ff] text-white" : "text-[#b8b8b8] hover:bg-white/10"}`}
        >
          CSS
        </button>
      </div>
      {activeEditor === "tsx" ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 rounded border border-[#4a4a4a] bg-[#1e1e1e] p-0.5">
            {(["tsx", "jsx"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={language === value}
                onClick={() => setLanguage(value)}
                className={`h-7 rounded text-[10px] font-medium ${language === value ? "bg-white/15 text-white" : "text-[#a7a7a7] hover:bg-white/10"}`}
              >
                {value === "tsx" ? "TypeScript" : "JavaScript"}
              </button>
            ))}
          </div>
          <textarea
            aria-label={`React and ${language === "tsx" ? "TypeScript" : "JavaScript"} source`}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            className="h-72 w-full resize-y rounded border border-[#4a4a4a] bg-[#1e1e1e] p-2 font-mono text-[10px] leading-4 text-[#e6e6e6] outline-none focus:border-[#0178ff]"
          />
        </div>
      ) : (
        <textarea
          aria-label="Custom CSS source"
          value={css}
          onChange={(event) => setCss(event.target.value)}
          spellCheck={false}
          className="h-72 w-full resize-y rounded border border-[#4a4a4a] bg-[#1e1e1e] p-2 font-mono text-[10px] leading-4 text-[#e6e6e6] outline-none focus:border-[#0178ff]"
        />
      )}
      {error ? (
        <div role="alert" className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[10px] leading-4 text-red-200">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button
          type="button"
          className="h-8 bg-[#0178ff] text-[10px] text-white hover:bg-[#0b86df]"
          disabled={!dirty || compiling}
          onClick={() => void apply()}
        >
          {compiling ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Code2 size={12} className="mr-1.5" />}
          Apply code
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Reset example"
          aria-label="Reset custom code example"
          className="h-8 w-8 border-[#4a4a4a] bg-transparent text-white hover:bg-white/10"
          disabled={compiling}
          onClick={reset}
        >
          <RotateCcw size={12} />
        </Button>
      </div>
    </InspectorSection>
  );
};
