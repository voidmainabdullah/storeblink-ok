import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store as StoreIcon, Sparkles } from "lucide-react";

// Public storefront routing deliberately has no merchant-auth dependency.
const StoreIndex = () => (
  <div className="grid min-h-screen place-items-center bg-background p-6">
    <Card className="w-full max-w-md p-10 text-center">
      <StoreIcon className="mx-auto mb-4 text-muted-foreground" size={40} />
      <h1 className="mb-2 text-2xl font-semibold">Choose a store URL</h1>
      <p className="mb-6 text-muted-foreground">
        Every storefront has its own address, such as{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/store/your-name</code>.
      </p>
      <div className="flex justify-center gap-2">
        <Button asChild><Link to="/auth"><Sparkles size={14} className="mr-1.5" />Create a store</Link></Button>
        <Button asChild variant="outline"><Link to="/">Back home</Link></Button>
      </div>
    </Card>
  </div>
);

export default StoreIndex;
