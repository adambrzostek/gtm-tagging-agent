import { firestore } from "./firestore";

export interface OrgEvent {
  id: string;
  event_group: string;
  event_name: string;
  description: string;
  parameters: string[];
  meta_event: string | null;
  tiktok_event: string | null;
  source: "default" | "custom";
  created_at: string;
}

type EventSeed = Omit<OrgEvent, "id" | "created_at" | "source">;

const DEFAULT_EVENTS: EventSeed[] = [
  {
    event_group: "Authentication",
    event_name: "sign_up",
    description: "User successfully creates a new account",
    parameters: ["method"],
    meta_event: "CompleteRegistration",
    tiktok_event: "CompleteRegistration",
  },
  {
    event_group: "Authentication",
    event_name: "login",
    description: "User successfully logs in",
    parameters: ["method"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Ecommerce",
    event_name: "view_item",
    description: "User views a product detail page",
    parameters: ["item_id", "item_name", "value", "currency"],
    meta_event: "ViewContent",
    tiktok_event: "ViewContent",
  },
  {
    event_group: "Ecommerce",
    event_name: "view_item_list",
    description: "User views a list/category of products",
    parameters: ["item_list_id", "item_list_name"],
    meta_event: "ViewContent",
    tiktok_event: "ViewContent",
  },
  {
    event_group: "Ecommerce",
    event_name: "select_item",
    description: "User selects a product from a list",
    parameters: ["item_id", "item_name", "item_list_name"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Ecommerce",
    event_name: "add_to_cart",
    description: "User adds a product to the cart",
    parameters: ["item_id", "item_name", "value", "currency", "quantity"],
    meta_event: "AddToCart",
    tiktok_event: "AddToCart",
  },
  {
    event_group: "Ecommerce",
    event_name: "remove_from_cart",
    description: "User removes a product from the cart",
    parameters: ["item_id", "item_name", "value", "currency", "quantity"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Ecommerce",
    event_name: "view_cart",
    description: "User views the shopping cart",
    parameters: ["value", "currency"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Ecommerce",
    event_name: "begin_checkout",
    description: "User starts the checkout process",
    parameters: ["value", "currency"],
    meta_event: "InitiateCheckout",
    tiktok_event: "InitiateCheckout",
  },
  {
    event_group: "Ecommerce",
    event_name: "add_shipping_info",
    description: "User adds shipping information during checkout",
    parameters: ["value", "currency", "shipping_tier"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Ecommerce",
    event_name: "add_payment_info",
    description: "User adds payment information during checkout",
    parameters: ["value", "currency", "payment_type"],
    meta_event: "AddPaymentInfo",
    tiktok_event: "AddPaymentInfo",
  },
  {
    event_group: "Ecommerce",
    event_name: "purchase",
    description: "User completes a purchase transaction",
    parameters: ["transaction_id", "value", "currency", "items"],
    meta_event: "Purchase",
    tiktok_event: "CompletePayment",
  },
  {
    event_group: "Ecommerce",
    event_name: "refund",
    description: "A purchase transaction is refunded",
    parameters: ["transaction_id", "value", "currency"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Lead generation",
    event_name: "generate_lead",
    description: "User submits a lead generation form",
    parameters: ["value", "currency", "lead_type"],
    meta_event: "Lead",
    tiktok_event: "SubmitForm",
  },
  {
    event_group: "Lead generation",
    event_name: "contact",
    description: "User initiates contact (e.g. clicks phone/email link)",
    parameters: ["method"],
    meta_event: "Contact",
    tiktok_event: "Contact",
  },
  {
    event_group: "Engagement",
    event_name: "search",
    description: "User performs a site search",
    parameters: ["search_term"],
    meta_event: "Search",
    tiktok_event: "Search",
  },
  {
    event_group: "Engagement",
    event_name: "share",
    description: "User shares content",
    parameters: ["method", "content_type", "item_id"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Engagement",
    event_name: "file_download",
    description: "User downloads a file",
    parameters: ["file_name", "file_extension"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Engagement",
    event_name: "video_start",
    description: "User starts playing a video",
    parameters: ["video_title", "video_provider"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Engagement",
    event_name: "video_complete",
    description: "User finishes watching a video",
    parameters: ["video_title", "video_provider"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Ecommerce",
    event_name: "view_promotion",
    description: "User views a promotional banner or offer",
    parameters: ["creative_name", "creative_slot", "promotion_id", "promotion_name"],
    meta_event: null,
    tiktok_event: null,
  },
  {
    event_group: "Ecommerce",
    event_name: "select_promotion",
    description: "User clicks a promotional banner or offer",
    parameters: ["creative_name", "creative_slot", "promotion_id", "promotion_name"],
    meta_event: null,
    tiktok_event: null,
  },
];

function eventsCollection(orgId: string) {
  return firestore().collection("orgs").doc(orgId).collection("customEvents");
}

export async function getOrgEvents(orgId: string): Promise<OrgEvent[]> {
  const col = eventsCollection(orgId);
  const snapshot = await col.get();

  if (snapshot.empty) {
    const now = new Date().toISOString();
    const batch = firestore().batch();
    for (const event of DEFAULT_EVENTS) {
      batch.set(col.doc(), { ...event, source: "default", created_at: now });
    }
    await batch.commit();
    const seeded = await col.get();
    return seeded.docs.map((doc) => ({ id: doc.id, ...doc.data() } as OrgEvent));
  }

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as OrgEvent));
}

export async function addOrgEvent(
  orgId: string,
  event: EventSeed
): Promise<void> {
  const col = eventsCollection(orgId);
  await col.add({ ...event, source: "custom", created_at: new Date().toISOString() });
}

export async function deleteOrgEvent(orgId: string, eventId: string): Promise<void> {
  const ref = eventsCollection(orgId).doc(eventId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Event not found");
  if ((doc.data() as OrgEvent).source !== "custom") {
    throw new Error("Cannot delete default events");
  }
  await ref.delete();
}
