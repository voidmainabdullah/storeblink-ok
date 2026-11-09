declare module "@tabler/icons-react/dist/esm/icons/*.mjs" {
  import type { ComponentType, SVGProps } from "react";

  const Icon: ComponentType<
    SVGProps<SVGSVGElement> & {
      size?: number | string;
      color?: string;
      stroke?: number | string;
    }
  >;

  export default Icon;
}
