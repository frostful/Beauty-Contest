import type { Metadata } from "next";
import { Space_Grotesk, Syne } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./game.css";
import "./readability.css";
import "./king-diamonds.css";
import "./card-background.css";
import "./borderland-atmosphere.css";
import "./admin.css";
import "./profile.css";
import "./deadlock.css";
import "./winner-coronation.css";
import "./rules-classic.css";
import "./home-polish.css";
import "./bots.css";
import "./connection-testing.css";
import "./joker-slow.css";
import "./personal-elimination.css";
import "./editorial-refactor.css";
import "./legal.css";
import "./ceremony-stage.css";
import "./game-stage.css";
import "./final-fixes.css";
import "./rule-amendment.css";

const body = Space_Grotesk({ variable: "--font-body", subsets: ["latin"] });
const display = Syne({ variable: "--font-display", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Median — The Beauty Contest";
  const description = "A live multiplayer game of averages, instinct, and elimination.";
  return {
    metadataBase: new URL(origin), title, description,
    icons: { icon: "/favicon.svg" },
    openGraph: { title, description, type:"website", images:[{url:`${origin}/og.png`,width:1536,height:1024,alt:"Median — The Beauty Contest"}] },
    twitter: { card:"summary_large_image", title, description, images:[`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${body.variable} ${display.variable}`}>{children}</body></html>;
}
