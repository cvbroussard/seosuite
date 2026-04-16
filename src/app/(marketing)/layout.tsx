import { MarketingNav } from "@/components/marketing-platform/nav";
import { MarketingFooter } from "@/components/marketing-platform/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-site">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />

      <style dangerouslySetInnerHTML={{ __html: marketingLayoutStyles }} />
    </div>
  );
}

const marketingLayoutStyles = `
  .marketing-site {
    font-family: var(--font-geist-sans), system-ui, sans-serif;
    color: #1a1a1a;
    background: #fff;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    -webkit-font-smoothing: antialiased;
  }
  .marketing-site main { flex: 1; }
  .marketing-site img { max-width: 100%; display: block; }
`;
