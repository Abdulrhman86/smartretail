import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Leaf, RotateCcw, ShieldCheck, Truck } from "lucide-react";

import heroImage from "@/assets/smart-retail/hero.jpg";
import apparelImage from "@/assets/smart-retail/category-apparel.jpg";
import footwearImage from "@/assets/smart-retail/category-footwear.jpg";
import accessoriesImage from "@/assets/smart-retail/category-accessories.jpg";
import homeGoodsImage from "@/assets/smart-retail/category-home-goods.jpg";
import electronicsImage from "@/assets/smart-retail/category-electronics.jpg";
import beautyImage from "@/assets/smart-retail/category-beauty.jpg";

import { get } from "../api/client";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import useDocumentTitle from "../hooks/useDocumentTitle";

// Slugs match the top-level categories in database/seed_data.sql; the backend
// expands a top-level slug to all of its subcategories.
const categories = [
  { slug: "apparel", name: "Apparel", image: apparelImage },
  { slug: "footwear", name: "Footwear", image: footwearImage },
  { slug: "accessories", name: "Accessories", image: accessoriesImage },
  { slug: "home-kitchen", name: "Home Goods", image: homeGoodsImage },
  { slug: "electronics", name: "Electronics", image: electronicsImage },
  { slug: "beauty-personal-care", name: "Beauty", image: beautyImage },
];

const valueProps = [
  {
    id: "shipping",
    icon: <Truck className="h-5 w-5" strokeWidth={1.5} />,
    title: "Free shipping over KD 15",
    description: "Complimentary standard shipping on qualifying orders.",
  },
  {
    id: "returns",
    icon: <RotateCcw className="h-5 w-5" strokeWidth={1.5} />,
    title: "Easy 30-day returns",
    description: "Simple, hassle-free returns within 30 days of delivery.",
  },
  {
    id: "secure",
    icon: <ShieldCheck className="h-5 w-5" strokeWidth={1.5} />,
    title: "Secure checkout",
    description: "Your account and orders are protected end to end.",
  },
  {
    id: "sustainable",
    icon: <Leaf className="h-5 w-5" strokeWidth={1.5} />,
    title: "Responsibly made",
    description: "Curated with sustainable materials and ethical production.",
  },
];

export function HomePage() {
  useDocumentTitle(null);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    get("/products?limit=8&sort=newest")
      .then((data) => !cancelled && setProducts(data))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {/* Hero */}
      <section className="relative">
        <div className="relative aspect-[4/5] w-full overflow-hidden sm:aspect-[3/2] lg:aspect-[16/9] lg:max-h-[85vh]">
          <img
            src={heroImage}
            alt="SmartRetail lifestyle scene with curated essentials"
            className="h-full w-full object-cover"
            width={1920}
            height={1080}
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 via-foreground/10 to-transparent" />
          <div className="absolute inset-0 flex items-end">
            <div className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
              <div className="max-w-xl text-background">
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-background/80">
                  New Collection
                </p>
                <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                  Thoughtfully designed essentials
                </h1>
                <p className="mt-4 max-w-md text-base leading-relaxed text-background/90 sm:text-lg">
                  Premium pieces for everyday living. Curated with care, built to
                  last, and made to fit seamlessly into your routine.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/products"
                    className="inline-flex items-center justify-center rounded-md bg-background px-8 py-3.5 text-sm font-semibold tracking-wide text-foreground transition-all hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground/50"
                  >
                    Shop Now
                  </Link>
                  <a
                    href="#categories"
                    className="inline-flex items-center justify-center rounded-md border border-background/60 px-8 py-3.5 text-sm font-semibold tracking-wide text-background transition-all hover:bg-background/10"
                  >
                    Browse Categories
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section id="categories" className="scroll-mt-16 py-20 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center sm:mb-16">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Shop by Category
            </h2>
            <p className="mt-3 text-muted-foreground">
              Explore our curated departments
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.slug}
                to={`/products?category=${category.slug}`}
                className="group relative aspect-[4/5] overflow-hidden rounded-lg bg-muted sm:aspect-[3/4]"
              >
                <img
                  src={category.image}
                  alt={category.name}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  width={768}
                  height={1024}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                  <h3 className="font-display text-2xl font-medium text-background sm:text-3xl">
                    {category.name}
                  </h3>
                  <span className="mt-2 inline-block text-sm font-medium text-background/80 underline-offset-4 transition-all group-hover:text-background group-hover:underline">
                    Discover
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section id="products" className="border-t border-border bg-secondary/30 py-20 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-col items-start justify-between gap-4 sm:mb-16 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                New Arrivals
              </h2>
              <p className="mt-3 text-muted-foreground">
                The latest additions to the collection
              </p>
            </div>
            <Link
              to="/products"
              className="text-sm font-medium text-foreground underline-offset-4 transition-colors hover:text-muted-foreground hover:underline"
            >
              View all
            </Link>
          </div>

          {error ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              We couldn&apos;t load products right now.{" "}
              <Link to="/products" className="font-medium text-foreground underline underline-offset-4">
                Browse the shop
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
                : products.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          )}
        </div>
      </section>

      {/* Value Props */}
      <section className="border-t border-border bg-background py-14 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {valueProps.map((prop) => (
              <div key={prop.id} className="flex items-start gap-4">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                  {prop.icon}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {prop.title}
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {prop.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default HomePage;
