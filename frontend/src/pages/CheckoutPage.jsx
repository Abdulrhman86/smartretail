import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { post as apiPost } from "../api/client";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { formatPrice, orderRef, variantLabel } from "../lib/format";
import { fallbackImageFor, handleImageError } from "../lib/images";

const COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Ireland",
  "Germany",
  "France",
  "Netherlands",
  "Australia",
  "Japan",
  "United Arab Emirates",
  "Saudi Arabia",
  "Jordan",
];

const SHIPPING_OPTIONS = [
  { id: "standard", title: "Standard Delivery", eta: "3–5 Business Days" },
  { id: "express", title: "Express Delivery", eta: "Next Business Day" },
];

const fieldWrap = "bg-surface-container-low px-4 py-3 focus-within:bg-surface-container-lowest focus-within:ring-1 focus-within:ring-primary-container transition-colors";
const fieldInput = "w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-on-surface-variant/40";
const fieldLabel = "block font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider";

export default function CheckoutPage() {
  useDocumentTitle("Checkout");
  const navigate = useNavigate();
  const { cartItems, loading: cartLoading, fetchCart } = useCart();
  const { user } = useAuth();

  const [orderCompleted, setOrderCompleted] = useState(null);

  // Redirect to /cart if cart is empty once loaded, unless an order was just completed
  useEffect(() => {
    if (!cartLoading && !orderCompleted && cartItems.length === 0) {
      navigate("/cart", { replace: true });
    }
  }, [cartLoading, cartItems.length, orderCompleted, navigate]);

  // Form State
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    street_address: "",
    suite_unit: "",
    city: "",
    state: "",
    postal_code: "",
    country: "United States",
    phone: "",
    delivery_notes: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [shippingMethod, setShippingMethod] = useState("standard");

  // Promo Code State
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState("");
  const [promoMessage, setPromoMessage] = useState({ text: "", tone: "info" });

  // Server-side quote (single source of truth for totals)
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteRequest = useRef(0);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const updateField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  const requestQuote = useCallback(async (method, code) => {
    const id = ++quoteRequest.current;
    setQuoteLoading(true);
    try {
      const result = await apiPost("/orders/quote", {
        shipping_method: method,
        ...(code ? { discount_code: code } : {}),
      });
      if (id === quoteRequest.current) setQuote(result);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err };
    } finally {
      if (id === quoteRequest.current) setQuoteLoading(false);
    }
  }, []);

  // Re-quote whenever the shipping method, applied code, or cart contents change.
  const cartSignature = cartItems.map((i) => `${i.id}:${i.quantity}`).join(",");
  useEffect(() => {
    if (cartLoading || orderCompleted || !cartItems.length) return;
    requestQuote(shippingMethod, appliedPromo).then(({ ok, error }) => {
      if (ok || !appliedPromo) {
        if (!ok) setErrorMessage(error.message);
        return;
      }
      // The applied code stopped being valid (e.g. subtotal dropped below the minimum).
      setAppliedPromo("");
      setPromoMessage({ text: error.message, tone: "error" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingMethod, appliedPromo, cartSignature, cartLoading, orderCompleted, requestQuote]);

  const handleApplyPromo = async (e) => {
    e.preventDefault();
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoMessage({ text: "Checking code…", tone: "info" });
    const { ok, result, error } = await requestQuote(shippingMethod, code);
    if (ok) {
      setAppliedPromo(code);
      setPromoInput("");
      setPromoMessage({ text: `Code ${code} applied — you save ${formatPrice(result.discount_amount)}.`, tone: "success" });
    } else {
      setPromoMessage({ text: error.message || "That code couldn't be applied.", tone: "error" });
    }
  };

  const removePromo = () => {
    setAppliedPromo("");
    setPromoMessage({ text: "", tone: "info" });
  };

  const validate = () => {
    const errors = {};
    if (!form.full_name.trim()) errors.full_name = "Recipient name is required.";
    if (!form.street_address.trim()) errors.street_address = "Street address is required.";
    if (!form.city.trim()) errors.city = "City is required.";
    if (!form.postal_code.trim()) errors.postal_code = "Postal code is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePlaceOrder = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage("");
    if (!validate()) {
      setErrorMessage("Please complete the highlighted shipping fields.");
      document.getElementById("shipping-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    setSubmitting(true);
    const shipping_address = Object.fromEntries(
      Object.entries(form)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v),
    );

    try {
      const order = await apiPost("/orders", {
        shipping_address,
        shipping_method: shippingMethod,
        ...(appliedPromo ? { discount_code: appliedPromo } : {}),
      });
      setOrderCompleted(order);
      window.scrollTo(0, 0);
      fetchCart();
    } catch (err) {
      setErrorMessage(err.message || "Failed to place order. Please verify your details.");
      // Stock or prices may have changed — refresh what the user sees.
      fetchCart();
    } finally {
      setSubmitting(false);
    }
  };

  const totalArticleCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = quote?.subtotal ?? cartItems.reduce((sum, item) => sum + item.line_total, 0);
  const freeShippingThreshold = quote?.free_shipping_threshold ?? 50;
  const standardPrice = subtotal >= freeShippingThreshold ? 0 : 5.99;

  // ── INLINE SUCCESS STATE (Order Confirmed) ──────────────────────────────────
  if (orderCompleted) {
    return (
      <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col justify-between">
        <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          <div className="h-20 max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop flex items-center justify-between">
            <div className="font-headline-md text-headline-md tracking-tight text-primary">
              <Link to="/">SmartRetail</Link>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
              <span className="material-symbols-outlined text-[15px]">verified</span>
              <span>Order Confirmed</span>
            </div>
          </div>
        </header>

        <main className="w-full pt-28 pb-16 px-margin-mobile md:px-margin-desktop max-w-[900px] mx-auto flex-1">
          <div className="bg-surface-container-lowest p-8 md:p-12 shadow-sm border border-surface-container-high space-y-8">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary-container text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">check</span>
              </div>
              <p className="font-label-caps text-label-caps uppercase text-surface-tint tracking-widest">Stage 03 / Order Confirmed</p>
              <h1 className="font-headline-md md:font-display-lg text-headline-md md:text-display-lg text-primary tracking-tight">
                Thank You for Your Order
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mx-auto">
                Your order {orderRef(orderCompleted.id)} has been received. You can follow its status from your account.
              </p>
            </div>

            <div className="bg-surface-container-low p-6 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-surface-container-high pb-4">
                <div>
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Order Reference</span>
                  <p className="font-label-md text-label-md font-semibold text-primary">{orderRef(orderCompleted.id)}</p>
                </div>
                <div>
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Status</span>
                  <p className="font-label-md text-label-md uppercase font-semibold text-primary">{orderCompleted.status}</p>
                </div>
                <div>
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Total Amount</span>
                  <p className="font-label-md text-label-md font-bold text-primary">{formatPrice(orderCompleted.total_amount)}</p>
                </div>
              </div>

              <div>
                <span className="font-label-caps text-label-caps uppercase text-on-surface-variant block mb-1">Dispatched To</span>
                <p className="font-body-md text-body-md text-primary font-medium">{orderCompleted.shipping_address?.full_name}</p>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {[orderCompleted.shipping_address?.street_address, orderCompleted.shipping_address?.suite_unit].filter(Boolean).join(", ")}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {[orderCompleted.shipping_address?.city, orderCompleted.shipping_address?.state, orderCompleted.shipping_address?.postal_code, orderCompleted.shipping_address?.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            </div>

            {orderCompleted.order_items?.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-headline-sm text-headline-sm text-primary">Order Summary</h3>
                <div className="divide-y divide-surface-container-high">
                  {orderCompleted.order_items.map((item) => (
                    <div key={item.id} className="py-3 flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium text-primary">{item.product_name}</p>
                        {item.variant_label && <p className="text-xs text-on-surface-variant">{item.variant_label}</p>}
                        <p className="text-xs text-on-surface-variant">Qty: {item.quantity}</p>
                      </div>
                      <span className="font-medium text-primary">{formatPrice(item.line_total)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 border-t border-surface-container-high pt-4 text-sm">
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Subtotal</span>
                    <span>{formatPrice(orderCompleted.subtotal)}</span>
                  </div>
                  {orderCompleted.discount_amount > 0 && (
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Discount</span>
                      <span>−{formatPrice(orderCompleted.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Shipping</span>
                    <span>{orderCompleted.shipping_amount > 0 ? formatPrice(orderCompleted.shipping_amount) : "Free"}</span>
                  </div>
                  <div className="flex justify-between pt-1 font-semibold text-primary">
                    <span>Total</span>
                    <span>{formatPrice(orderCompleted.total_amount)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to={`/account/orders/${orderCompleted.id}`}
                className="py-3.5 px-8 bg-primary-container hover:bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-widest text-center transition-colors"
              >
                View Order
              </Link>
              <Link
                to="/products"
                className="py-3.5 px-8 bg-surface-container hover:bg-surface-container-high text-primary font-label-caps text-label-caps uppercase tracking-widest text-center transition-colors"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </main>

        <footer className="w-full bg-surface-container-low py-6 text-center text-on-surface-variant font-label-md text-xs">
          © {new Date().getFullYear()} SmartRetail. All rights reserved.
        </footer>
      </div>
    );
  }

  // ── MAIN CHECKOUT SCREEN ──────────────────────────────────────────────────
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between">
      {/* Fixed Navigation Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-20 max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop flex items-center justify-between">
          <Link
            className="inline-flex items-center gap-2 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
            to="/cart"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span className="hidden sm:inline">Return to Cart</span>
          </Link>
          <div className="absolute left-1/2 -translate-x-1/2">
            <Link className="font-headline-md text-headline-md tracking-tight text-primary" to="/">
              SmartRetail
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
              <span className="material-symbols-outlined text-[15px] text-on-surface-variant">lock</span>
              <span className="hidden sm:inline">Secure Checkout</span>
            </div>
            <Link to="/account" className="w-8 h-8 rounded-full bg-primary flex items-center justify-center" aria-label="My account">
              <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full pt-20 bg-surface flex-1">
        <div className="flex flex-col w-full">
          {/* Progress Header & Step Navigation */}
          <section className="w-full bg-surface-bright pb-stack-lg">
            <div className="max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-primary-container"></span>
                    <p className="font-label-caps text-label-caps uppercase text-surface-tint tracking-widest">Order Processing / Stage 02</p>
                  </div>
                  <h1 className="font-headline-md md:font-display-lg text-headline-md md:text-display-lg text-primary tracking-tight">Checkout</h1>
                </div>

                <nav aria-label="Checkout Steps" className="flex items-center gap-3 sm:gap-4 font-label-md text-label-md">
                  <Link to="/cart" className="flex items-center gap-2 text-on-surface-variant/70 hover:text-primary">
                    <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center font-label-caps text-label-caps text-on-surface-variant">
                      ✓
                    </span>
                    <span>01 Cart</span>
                  </Link>
                  <span className="text-surface-container-highest">/</span>
                  <div className="flex items-center gap-2 text-primary" aria-current="step">
                    <span className="w-5 h-5 rounded-full bg-primary-container flex items-center justify-center font-label-caps text-label-caps text-on-primary">2</span>
                    <span className="font-semibold underline underline-offset-8 decoration-primary-container decoration-1">02 Shipping Details</span>
                  </div>
                  <span className="text-surface-container-highest">/</span>
                  <div className="flex items-center gap-2 text-on-surface-variant/40">
                    <span className="w-5 h-5 rounded-full bg-surface-container-low flex items-center justify-center font-label-caps text-label-caps text-on-surface-variant/50">3</span>
                    <span>03 Confirmation</span>
                  </div>
                </nav>
              </div>
              <div className="w-full h-px bg-surface-container-highest"></div>
            </div>
          </section>

          {errorMessage && (
            <section className="w-full pt-4" role="alert">
              <div className="max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop">
                <div className="p-4 bg-error-container/20 border-l-4 border-error flex items-start gap-3">
                  <span className="material-symbols-outlined text-error text-[20px] flex-shrink-0">error</span>
                  <div className="flex-1">
                    <p className="font-label-md text-label-md font-semibold text-error">Unable to complete checkout</p>
                    <p className="font-body-md text-body-md text-on-surface text-sm mt-0.5">{errorMessage}</p>
                  </div>
                  <button type="button" onClick={() => setErrorMessage("")} className="text-on-surface-variant hover:text-on-surface" aria-label="Dismiss">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="w-full py-stack-md md:py-stack-lg">
            <div className="max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
                {/* Left Column */}
                <div className="lg:col-span-7 flex flex-col gap-stack-lg">
                  <div id="shipping-form" className="scroll-mt-28 bg-surface-container-lowest p-6 sm:p-10 shadow-sm rounded-none">
                    <div className="flex items-baseline justify-between mb-8 pb-4 bg-surface-container-low/50 -mx-6 sm:-mx-10 px-6 sm:px-10 -mt-6 sm:-mt-10 pt-6">
                      <div>
                        <span className="font-label-caps text-label-caps uppercase text-surface-tint tracking-wider">Destination</span>
                        <h2 className="font-headline-sm text-headline-sm text-primary mt-1">Shipping Details</h2>
                      </div>
                      <span className="font-label-caps text-label-caps text-on-surface-variant">Step 2 of 3</span>
                    </div>

                    <div className="mb-8 p-4 bg-surface-container-low flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="font-label-md text-label-md text-primary font-medium truncate">
                            Logged in as {user?.full_name || user?.email}
                          </p>
                          {user?.full_name && <p className="font-label-caps text-label-caps text-on-surface-variant truncate">{user?.email}</p>}
                        </div>
                      </div>
                    </div>

                    <form className="space-y-6" onSubmit={handlePlaceOrder} noValidate>
                      <Field id="full-name" label="Recipient Full Name" required error={fieldErrors.full_name}>
                        <input className={fieldInput} id="full-name" autoComplete="name" placeholder="Full name" value={form.full_name} onChange={updateField("full_name")} />
                      </Field>

                      <Field id="street-address" label="Street Address" required error={fieldErrors.street_address}>
                        <input className={fieldInput} id="street-address" autoComplete="address-line1" placeholder="e.g. 1042 Market St" value={form.street_address} onChange={updateField("street_address")} />
                      </Field>

                      <Field id="suite-unit" label="Apartment, Suite, Unit" optional>
                        <input className={fieldInput} id="suite-unit" autoComplete="address-line2" placeholder="e.g. Apt 4B or Suite 200" value={form.suite_unit} onChange={updateField("suite_unit")} />
                      </Field>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field id="city" label="City" required error={fieldErrors.city}>
                          <input className={fieldInput} id="city" autoComplete="address-level2" placeholder="San Francisco" value={form.city} onChange={updateField("city")} />
                        </Field>
                        <Field id="state" label="State / Province" optional>
                          <input className={fieldInput} id="state" autoComplete="address-level1" placeholder="CA" value={form.state} onChange={updateField("state")} />
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field id="zip-code" label="Postal / ZIP" required error={fieldErrors.postal_code}>
                          <input className={fieldInput} id="zip-code" autoComplete="postal-code" placeholder="94107" value={form.postal_code} onChange={updateField("postal_code")} />
                        </Field>
                        <div className="space-y-1.5">
                          <label className={fieldLabel} htmlFor="country-region">
                            Country / Region <span className="text-primary">*</span>
                          </label>
                          <div className={`relative ${fieldWrap}`}>
                            <select
                              className="w-full bg-transparent font-body-md text-body-md text-on-surface appearance-none focus:outline-none pr-8 cursor-pointer"
                              id="country-region"
                              autoComplete="country-name"
                              value={form.country}
                              onChange={updateField("country")}
                            >
                              {COUNTRIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <span className="absolute right-3.5 top-3.5 material-symbols-outlined text-[18px] text-on-surface-variant pointer-events-none">expand_more</span>
                          </div>
                        </div>
                      </div>

                      <Field id="phone" label="Phone" optional>
                        <input className={fieldInput} id="phone" type="tel" autoComplete="tel" placeholder="For delivery updates" value={form.phone} onChange={updateField("phone")} />
                      </Field>

                      {/* Shipping Method Selector */}
                      <fieldset className="pt-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <legend className={fieldLabel}>Delivery Method</legend>
                          <span className="text-xs text-on-surface-variant/70 italic">
                            Standard shipping is free on orders over {formatPrice(freeShippingThreshold)}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {SHIPPING_OPTIONS.map((option) => {
                            const selected = shippingMethod === option.id;
                            const price = option.id === "standard" ? standardPrice : 14.99;
                            return (
                              <label
                                key={option.id}
                                className={`relative flex items-start p-4 cursor-pointer transition-colors ${
                                  selected ? "bg-surface-container-high/60 shadow-[inset_2px_0_0_0_#2c3e4a]" : "bg-surface-container-low hover:bg-surface-container"
                                }`}
                              >
                                <input
                                  checked={selected}
                                  onChange={() => setShippingMethod(option.id)}
                                  className="mt-1 text-primary focus:ring-0 cursor-pointer"
                                  name="shipping-method"
                                  type="radio"
                                  value={option.id}
                                />
                                <div className="ml-3">
                                  <p className={`font-label-md text-label-md ${selected ? "text-primary font-semibold" : "text-on-surface font-medium"}`}>{option.title}</p>
                                  <p className="font-label-caps text-label-caps text-on-surface-variant">{option.eta}</p>
                                </div>
                                <span className="ml-auto font-label-md text-label-md text-primary uppercase font-medium">
                                  {price === 0 ? "Free" : formatPrice(price)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>

                      <div className="pt-2">
                        <label className={`${fieldLabel} mb-1.5`} htmlFor="delivery-notes">
                          Courier Access Notes <span className="text-on-surface-variant/50 lowercase font-normal">(optional)</span>
                        </label>
                        <textarea
                          className="w-full bg-surface-container-low p-3 font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-on-surface-variant/40 resize-none"
                          id="delivery-notes"
                          placeholder="Gate code, or leave with the front desk."
                          rows={2}
                          maxLength={500}
                          value={form.delivery_notes}
                          onChange={updateField("delivery_notes")}
                        />
                      </div>
                    </form>
                  </div>

                  {/* Promo Card */}
                  <div className="bg-surface-container-lowest p-6 sm:p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px] text-surface-tint">redeem</span>
                        <h3 className="font-headline-sm text-headline-sm text-primary">Promo Code</h3>
                      </div>
                      {appliedPromo && (
                        <button
                          type="button"
                          onClick={removePromo}
                          className="inline-flex items-center gap-1 font-label-caps text-label-caps px-2 py-0.5 bg-secondary-container text-on-secondary-fixed text-[11px] font-semibold tracking-widest uppercase hover:bg-surface-container-high"
                          aria-label={`Remove code ${appliedPromo}`}
                        >
                          {appliedPromo}
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      )}
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant mb-4">Have a discount code? Enter it below — new customers can try WELCOME10.</p>
                    <form onSubmit={handleApplyPromo} className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-grow bg-surface-container-low px-4 py-3 flex items-center">
                        <input
                          className="w-full bg-transparent font-label-md text-label-md text-primary font-semibold tracking-wider uppercase focus:outline-none"
                          id="promo-input"
                          placeholder="Enter promotion code"
                          aria-label="Promotion code"
                          value={promoInput}
                          onChange={(e) => setPromoInput(e.target.value)}
                        />
                      </div>
                      <button
                        className="px-8 py-3 bg-surface-container hover:bg-surface-container-high text-primary font-label-caps text-label-caps uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                        type="submit"
                        disabled={!promoInput.trim()}
                      >
                        Apply
                      </button>
                    </form>
                    {promoMessage.text && (
                      <div
                        className={`mt-3 flex items-center gap-2 font-label-md text-label-md ${
                          promoMessage.tone === "error" ? "text-error" : promoMessage.tone === "success" ? "text-primary" : "text-surface-tint"
                        }`}
                        role="status"
                      >
                        <span className="material-symbols-outlined text-[16px]">{promoMessage.tone === "error" ? "error" : "tag"}</span>
                        <span>{promoMessage.text}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-6 bg-surface-container-low shadow-sm flex items-start gap-4">
                    <span className="material-symbols-outlined text-[24px] text-primary-container flex-shrink-0 mt-0.5">verified_user</span>
                    <div>
                      <h4 className="font-headline-sm text-headline-sm text-primary">Demo Checkout — No Payment Required</h4>
                      <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                        SmartRetail is a portfolio project. Placing an order records it as pending and reserves stock, but no card is requested
                        or charged. You can cancel a pending order from your account.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column: Order Summary */}
                <aside className="lg:col-span-5 lg:sticky lg:top-28 flex flex-col gap-6">
                  <div className="bg-surface-container-lowest p-6 sm:p-8 shadow-sm">
                    <div className="flex items-baseline justify-between pb-4 bg-surface-container-low/60 -mx-6 sm:-mx-8 px-6 sm:px-8 -mt-6 sm:-mt-8 pt-6 mb-6">
                      <div>
                        <span className="font-label-caps text-label-caps uppercase text-surface-tint tracking-widest">Manifest</span>
                        <h2 className="font-headline-sm text-headline-sm text-primary">Order Summary</h2>
                      </div>
                      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        {totalArticleCount} {totalArticleCount === 1 ? "Article" : "Articles"}
                      </span>
                    </div>

                    <div className="space-y-6">
                      {cartItems.map((item) => {
                        const variant = item.product_variants;
                        const product = variant?.products;
                        const imageKey = product?.id || item.id;
                        return (
                          <div key={item.id} className="flex gap-4 items-center group">
                            <div className="relative w-20 h-24 bg-surface-container flex-shrink-0 overflow-hidden">
                              <img
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                src={variant?.image_url || product?.image_url || fallbackImageFor(imageKey)}
                                onError={handleImageError(imageKey)}
                                alt={product?.name || "Product"}
                              />
                              <span className="absolute top-1 right-1 bg-primary text-on-primary font-label-caps text-[10px] min-w-4 h-4 px-1 flex items-center justify-center rounded-full">
                                {item.quantity}
                              </span>
                            </div>
                            <div className="flex-grow min-w-0">
                              <div className="flex justify-between items-start">
                                <h3 className="font-headline-sm text-[18px] leading-tight text-primary truncate">{product?.name || "Item"}</h3>
                                <span className="font-label-md text-label-md text-primary font-semibold ml-2">{formatPrice(item.line_total)}</span>
                              </div>
                              <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mt-1">{variantLabel(variant) || "Standard"}</p>
                              <p className="font-label-md text-label-md text-on-surface-variant/70 mt-0.5">
                                Qty: {item.quantity} ({formatPrice(item.unit_price)} each)
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className={`mt-8 pt-6 bg-surface-container-low/40 -mx-6 sm:-mx-8 px-6 sm:px-8 space-y-3 transition-opacity ${quoteLoading ? "opacity-60" : ""}`}>
                      <div className="flex justify-between font-label-md text-label-md text-on-surface-variant">
                        <span>Subtotal</span>
                        <span className="text-on-surface font-medium">{formatPrice(subtotal)}</span>
                      </div>
                      <div className="flex justify-between font-label-md text-label-md text-on-surface-variant">
                        <span>Shipping ({shippingMethod === "express" ? "Express" : "Standard"})</span>
                        <span className="text-primary font-medium">
                          {quote ? (quote.shipping_amount === 0 ? "Free" : formatPrice(quote.shipping_amount)) : "—"}
                        </span>
                      </div>
                      {quote?.discount_amount > 0 && (
                        <div className="flex justify-between items-center font-label-md text-label-md">
                          <span className="text-surface-tint">Promo Code ({quote.discount_code})</span>
                          <span className="text-primary font-medium">−{formatPrice(quote.discount_amount)}</span>
                        </div>
                      )}

                      <div className="w-full h-px bg-surface-container-high my-2"></div>

                      <div className="flex justify-between items-baseline pt-1 pb-2">
                        <div>
                          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider block">Order Total</span>
                          <span className="font-headline-md text-headline-md text-primary font-normal">Total</span>
                        </div>
                        <div className="text-right">
                          <span className="font-label-caps text-label-caps text-surface-tint uppercase block">USD</span>
                          <span className="font-headline-md text-headline-md text-primary font-medium tracking-tight">
                            {quote ? formatPrice(quote.total_amount) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      <button
                        onClick={handlePlaceOrder}
                        disabled={submitting || cartLoading || !quote}
                        className="w-full py-4 px-8 bg-primary-container hover:bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        type="button"
                      >
                        {submitting ? (
                          <>
                            <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                            <span>Processing Order...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px]">lock</span>
                            <span>Place Order{quote ? ` · ${formatPrice(quote.total_amount)}` : ""}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="mt-6 pt-4 space-y-2">
                      <div className="flex items-center gap-2.5 text-on-surface-variant font-label-md text-label-md">
                        <span className="material-symbols-outlined text-[18px] text-surface-tint">enhanced_encryption</span>
                        <span>Encrypted connection to our servers</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-on-surface-variant font-label-md text-label-md">
                        <span className="material-symbols-outlined text-[18px] text-surface-tint">published_with_changes</span>
                        <span>Complimentary 30-day returns &amp; exchanges</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-on-surface-variant font-label-md text-label-md">
                        <span className="material-symbols-outlined text-[18px] text-surface-tint">local_shipping</span>
                        <span>Free standard shipping over {formatPrice(freeShippingThreshold)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-container-low p-6 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center flex-shrink-0 text-primary font-headline-sm text-[18px]">
                      S
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-surface-tint uppercase tracking-wider">Need a hand?</p>
                      <p className="font-body-md text-body-md text-on-surface-variant mt-1">Questions about delivery, returns or sizing before you order?</p>
                      <Link className="inline-flex items-center gap-1 mt-2 font-label-md text-label-md text-primary font-semibold hover:underline" to="/help#faq">
                        <span>Read our FAQ</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="w-full bg-surface-container-low">
        <div className="max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop py-stack-xl flex flex-col md:flex-row items-center justify-between gap-stack-md text-on-surface-variant">
          <div className="flex items-center gap-2 font-label-md text-label-md">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">verified_user</span>
            <span>Demo store — no real payments are processed</span>
          </div>
          <nav className="flex items-center gap-6 font-label-md text-label-md">
            <Link className="text-on-surface-variant hover:text-on-surface transition-colors" to="/help#privacy">Privacy Policy</Link>
            <Link className="text-on-surface-variant hover:text-on-surface transition-colors" to="/help#terms">Terms of Service</Link>
            <Link className="text-on-surface-variant hover:text-on-surface transition-colors" to="/help#shipping">Returns</Link>
          </nav>
          <div className="font-label-md text-label-md">© {new Date().getFullYear()} SmartRetail. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}

function Field({ id, label, required, optional, error, children }) {
  return (
    <div className="space-y-1.5">
      <label className={fieldLabel} htmlFor={id}>
        {label} {required && <span className="text-primary">*</span>}
        {optional && <span className="text-on-surface-variant/50 lowercase font-normal">(optional)</span>}
      </label>
      <div className={`${fieldWrap} ${error ? "ring-1 ring-error" : ""}`}>{children}</div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
