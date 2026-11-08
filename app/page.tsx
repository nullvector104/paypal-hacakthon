"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { calculateEqualSplit } from "@/lib/split-math";

interface CartItem {
  id: string;
  productId: string;
  title: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  offerUrl: string | null;
}

interface Product {
  id: string;
  title: string;
  imageUrl: string;
  cheapestPrice: number;
  currency: string;
  offerUrl: string;
  domain: string;
}

interface TagSummary {
  id: string;
  name: string;
  monthlyLimit: number;
  clubId?: string | null;
  spent: number;
  remaining: number;
  percentageUsed: number;
  status: "normal" | "warning_80" | "exceeded_100";
}

interface ClubMember {
  id: string;
  name: string;
  email: string;
  role: "TREASURER" | "MEMBER";
}

interface Club {
  id: string;
  name: string;
  description: string | null;
  balance: number;
  members: ClubMember[];
  collected?: number;
  paidOut?: number;
  tags?: { id: string; name: string; monthlyLimit: number }[];
  createdAt?: string;
}

interface MovementItemDetail {
  id: string;
  productId?: string | null;
  title: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
}

interface Movement {
  id: string;
  type: "CART_PAYMENT" | "SEND" | "REQUEST" | "CLUB_DUES" | "CLUB_PAYOUT";
  direction: "OUTGOING" | "INCOMING";
  counterparty: string;
  amount: number;
  currency: string;
  tag: { id: string; name: string };
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED" | "UNCLAIMED";
  paypalRefId: string;
  invoiceUrl: string | null;
  note: string | null;
  clubId?: string | null;
  club: { id: string; name: string } | null;
  items?: MovementItemDetail[];
  createdAt: string;
}

interface RecipientSummary {
  email: string;
  allTimeTotal: number;
  thisMonthTotal: number;
  count: number;
  lastTransactionDate?: string | null;
}

interface DuesMemberStatus {
  memberId: string;
  memberName: string;
  memberEmail: string;
  role: "TREASURER" | "MEMBER";
  status: "PAID" | "PENDING" | "OVERDUE" | "UNBILLED";
  amount: number;
  movementId: string | null;
  invoiceUrl: string | null;
  paypalRefId: string | null;
  paidAt: string | null;
}

interface DuesCycleView {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  isPastDueDate: boolean;
  totalExpected: number;
  totalCollected: number;
  progressPercent: number;
  memberStatuses: DuesMemberStatus[];
  createdAt: string;
}

interface ReimbursementClaimView {
  id: string;
  clubId: string;
  requesterEmail: string;
  requesterName: string;
  amount: number;
  note: string;
  tag: { id: string; name: string };
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID";
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  flaggedSelfApproved: boolean;
  movementId: string | null;
  createdAt: string;
}

interface AuditLogView {
  id: string;
  who: string;
  role: string;
  action: string;
  target: string;
  details: string | null;
  createdAt: string;
}

interface EventFundraiserView {
  id: string;
  title: string;
  description: string | null;
  goalAmount: number;
  status: string;
  clubId: string | null;
  clubName: string | null;
  tagId: string;
  tagName: string;
  totalCollected: number;
  progressPercent: number;
  remaining: number;
  donorCount: number;
  isGoalReached: boolean;
  recentDonors: Array<{
    id: string;
    contributor: string;
    amount: number;
    date: string;
    note: string | null;
  }>;
  createdAt: string;
}

interface BillSplitView {
  id: string;
  title: string;
  totalAmount: number;
  includeCreator: boolean;
  creatorEmail: string;
  clubId: string | null;
  clubName: string | null;
  tagId: string;
  tagName: string;
  collected: number;
  pending: number;
  totalRequested: number;
  progressPercent: number;
  isFullySettled: boolean;
  requestsCount: number;
  paidCount: number;
  memberStatuses: Array<{
    movementId: string;
    memberEmail: string;
    amount: number;
    status: string;
    paypalRefId: string;
    invoiceUrl: string | null;
    paidAt: string | null;
    note: string | null;
  }>;
  createdAt: string;
}

function formatInlineStyles(text: string): React.ReactNode {
  // Parse **bold**, `code`, and $amounts
  const parts = text.split(/(\*\*.*?\*\*|`.*?`|\$[\d,]+(?:\.\d{2})?)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const boldText = part.slice(2, -2);
      if (boldText.includes("$")) {
        return (
          <span key={i} className="copilot-amount-pill">
            {boldText}
          </span>
        );
      }
      return (
        <strong key={i} style={{ color: "#0f172a", fontWeight: 800 }}>
          {boldText}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <span key={i} className="copilot-tag-pill">
          {part.slice(1, -1)}
        </span>
      );
    }
    if (part.startsWith("$") && /^[\$\d,]+(?:\.\d{2})?$/.test(part)) {
      return (
        <span key={i} className="copilot-amount-pill">
          {part}
        </span>
      );
    }
    return part;
  });
}

function renderFormattedCopilotText(text: string) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={`empty-${lineIdx}`} style={{ height: "0.35rem" }} />);
      return;
    }

    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3
          key={`h3-${lineIdx}`}
          style={{
            fontSize: "1.02rem",
            fontWeight: 800,
            color: "#0f172a",
            margin: "0.55rem 0 0.25rem 0",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          {formatInlineStyles(trimmed.slice(4))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2
          key={`h2-${lineIdx}`}
          style={{
            fontSize: "1.1rem",
            fontWeight: 800,
            color: "#003087",
            margin: "0.65rem 0 0.3rem 0",
          }}
        >
          {formatInlineStyles(trimmed.slice(3))}
        </h2>
      );
      return;
    }

    if (trimmed === "---" || trimmed === "***") {
      elements.push(
        <hr
          key={`hr-${lineIdx}`}
          style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "0.55rem 0" }}
        />
      );
      return;
    }

    if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      const content = trimmed.replace(/^[\*\-•]\s+/, "");
      elements.push(
        <div
          key={`li-${lineIdx}`}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.45rem",
            margin: "0.22rem 0",
          }}
        >
          <span style={{ color: "#3b82f6", fontWeight: 800, fontSize: "0.9rem", lineHeight: "1.4" }}>
            •
          </span>
          <div style={{ flex: 1, fontSize: "0.86rem", color: "#1e293b", lineHeight: "1.6" }}>
            {formatInlineStyles(content)}
          </div>
        </div>
      );
      return;
    }

    elements.push(
      <p
        key={`p-${lineIdx}`}
        style={{ fontSize: "0.86rem", color: "#1e293b", lineHeight: "1.65", margin: "0.25rem 0" }}
      >
        {formatInlineStyles(trimmed)}
      </p>
    );
  });

  return <div className="copilot-rich-text">{elements}</div>;
}

export default function OrbitApp() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<
    "home" | "send-request" | "instamart" | "payment-methods" | "activity" | "club" | "profile"
  >("home");

  // Club Sub-Tab Navigation
  const [clubSubTab, setClubSubTab] = useState<"overview" | "fundraiser" | "dues" | "requests" | "ledger">("overview");

  // Fundraiser State
  const [events, setEvents] = useState<EventFundraiserView[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventDonationAmount, setEventDonationAmount] = useState<string>("25.00");
  const [eventDonorName, setEventDonorName] = useState<string>("Alex Vance");
  const [eventDonorEmail, setEventDonorEmail] = useState<string>("treasurer@roboticsclub.org");
  const [donatingToEvent, setDonatingToEvent] = useState<boolean>(false);
  const [donationSuccessMsg, setDonationSuccessMsg] = useState<string | null>(null);

  // New Event Form
  const [newEventTitle, setNewEventTitle] = useState<string>("Robotics World Finals Tokyo 2026");
  const [newEventDesc, setNewEventDesc] = useState<string>("Travel and kit fund for the international autonomous championship.");
  const [newEventGoal, setNewEventGoal] = useState<string>("1200.00");
  const [creatingEvent, setCreatingEvent] = useState<boolean>(false);

  // Bill Split State
  const [splits, setSplits] = useState<BillSplitView[]>([]);
  const [splitTitle, setSplitTitle] = useState<string>("Hardware & Pizza Night");
  const [splitTotal, setSplitTotal] = useState<string>("90.00");
  const [splitIncludeCreator, setSplitIncludeCreator] = useState<boolean>(true);
  const [splitSelectedMembers, setSplitSelectedMembers] = useState<string[]>([
    "jordan@roboticsclub.org",
    "sam@roboticsclub.org",
  ]);
  const [creatingSplit, setCreatingSplit] = useState<boolean>(false);
  const [splitSuccessMsg, setSplitSuccessMsg] = useState<string | null>(null);
  const [settlingMovementId, setSettlingMovementId] = useState<string | null>(null);
  const [deletingSplitId, setDeletingSplitId] = useState<string | null>(null);

  // Club Dues & Claims State
  const [duesCycles, setDuesCycles] = useState<DuesCycleView[]>([]);
  const [claims, setClaims] = useState<ReimbursementClaimView[]>([]);
  const [clubAuditLogs, setClubAuditLogs] = useState<AuditLogView[]>([]);

  // Dues creation form
  const [newDuesTitle, setNewDuesTitle] = useState<string>("Fall 2026 Season Dues");
  const [newDuesAmount, setNewDuesAmount] = useState<string>("35.00");
  const [newDuesDueDate, setNewDuesDueDate] = useState<string>("2026-11-16");
  const [creatingDues, setCreatingDues] = useState<boolean>(false);

  // Claim submission form
  const [claimAmount, setClaimAmount] = useState<string>("18.50");
  const [claimTagId, setClaimTagId] = useState<string>("");
  const [claimNote, setClaimNote] = useState<string>("Ultrasonic sensors for robot");
  const [submittingClaim, setSubmittingClaim] = useState<boolean>(false);

  // Self-approval certification modal
  const [claimToApprove, setClaimToApprove] = useState<ReimbursementClaimView | null>(null);
  const [selfCertified, setSelfCertified] = useState<boolean>(false);
  const [approvingClaim, setApprovingClaim] = useState<boolean>(false);

  // Role Switcher (Treasurer vs Member)
  const [role, setRole] = useState<"TREASURER" | "MEMBER">("TREASURER");
  const [dismissTopNotice, setDismissTopNotice] = useState<boolean>(false);

  const currentSessionEmail =
    role === "TREASURER" ? "treasurer@roboticsclub.org" : "jordan@roboticsclub.org";
  const currentSessionName =
    role === "TREASURER" ? "Alex Rivera (Finance Controller)" : "Jordan Lee (Lead Systems Engineer)";

  // Step 7: Orbit AI Command Bar & Copilot State
  const [aiQuery, setAiQuery] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResponse, setAiResponse] = useState<{
    text: string;
    toolCalls: Array<{ tool: string; durationMs: number; args: any; result: any }>;
    draftAction: any | null;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiConfirming, setAiConfirming] = useState<boolean>(false);
  const [aiConfirmedResult, setAiConfirmedResult] = useState<{
    message: string;
    movementId?: string;
  } | null>(null);

  // Dockable & Minimizable Copilot State
  const [copilotOpen, setCopilotOpen] = useState<boolean>(false);
  const [copilotDock, setCopilotDock] = useState<"right" | "left">("right");
  const [copilotMinimizedInline, setCopilotMinimizedInline] = useState<boolean>(true);

  // Payment History & Contact Inspection State
  const [selectedContactForModal, setSelectedContactForModal] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<"movements" | "contacts">("movements");
  const [contactsSearch, setContactsSearch] = useState<string>("");

  const previewSplit = useMemo(() => {
    try {
      const num = parseFloat(splitTotal);
      if (isNaN(num) || num <= 0 || splitSelectedMembers.length === 0) return null;
      return calculateEqualSplit({
        totalAmount: num,
        memberEmails: splitSelectedMembers,
        includeCreator: splitIncludeCreator,
        creatorEmail: currentSessionEmail,
      });
    } catch {
      return null;
    }
  }, [splitTotal, splitSelectedMembers, splitIncludeCreator, currentSessionEmail]);

  // Unified Ledger State
  const [movements, setMovements] = useState<Movement[]>([]);

  // Memoized Counterparty / Contact Aggregation for Payment History
  const contactsSummaryList = useMemo(() => {
    const map = new Map<
      string,
      {
        counterparty: string;
        totalSent: number;
        totalReceived: number;
        count: number;
        lastDate: string;
        tags: Set<string>;
        isOrg: boolean;
        recentMovements: Movement[];
      }
    >();

    for (const m of movements) {
      const key = m.counterparty.trim().toLowerCase();
      if (!key) continue;
      let entry = map.get(key);
      if (!entry) {
        const isOrg =
          !m.counterparty.includes("@") ||
          m.counterparty.toLowerCase().includes("club") ||
          m.counterparty.toLowerCase().includes("merchant");
        entry = {
          counterparty: m.counterparty,
          totalSent: 0,
          totalReceived: 0,
          count: 0,
          lastDate: m.createdAt,
          tags: new Set<string>(),
          isOrg,
          recentMovements: [],
        };
        map.set(key, entry);
      }
      entry.count += 1;
      if (m.direction === "OUTGOING" && m.status === "COMPLETED") {
        entry.totalSent += m.amount;
      } else if (m.direction === "INCOMING" && m.status === "COMPLETED") {
        entry.totalReceived += m.amount;
      }
      if (m.tag?.name) entry.tags.add(m.tag.name);
      if (entry.recentMovements.length < 10) {
        entry.recentMovements.push(m);
      }
      if (new Date(m.createdAt) > new Date(entry.lastDate)) {
        entry.lastDate = m.createdAt;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => b.totalSent + b.totalReceived - (a.totalSent + a.totalReceived)
    );
  }, [movements]);

  // Movements for currently selected contact modal
  const selectedContactData = useMemo(() => {
    if (!selectedContactForModal) return null;
    const match = contactsSummaryList.find(
      (c) => c.counterparty.toLowerCase() === selectedContactForModal.toLowerCase()
    );
    if (!match) return null;
    const allMovements = movements.filter(
      (m) => m.counterparty.toLowerCase() === selectedContactForModal.toLowerCase()
    );
    return { ...match, allMovements };
  }, [contactsSummaryList, movements, selectedContactForModal]);

  // PayPal Config
  const [clientId, setClientId] = useState<string>("");
  const [loadingConfig, setLoadingConfig] = useState<boolean>(true);

  // Instamart & Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartTotal, setCartTotal] = useState<number>(0);
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("coffee");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // Tags & Spending State
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [newTagName, setNewTagName] = useState<string>("");
  const [newTagLimit, setNewTagLimit] = useState<string>("");
  const [showAddTag, setShowAddTag] = useState<boolean>(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState<string>("");
  const [editTagLimit, setEditTagLimit] = useState<string>("");
  const [savingTag, setSavingTag] = useState<boolean>(false);
  const [showAllTags, setShowAllTags] = useState<boolean>(false);

  // Club & Treasury State
  const [clubs, setClubs] = useState<Club[]>([]);
  const [activeClub, setActiveClub] = useState<Club | null>(null);

  // Add Club Modal State & Inputs
  const [showAddClubModal, setShowAddClubModal] = useState<boolean>(false);
  const [newClubName, setNewClubName] = useState<string>("");
  const [newClubDescription, setNewClubDescription] = useState<string>("");
  const [newClubTreasurerName, setNewClubTreasurerName] = useState<string>("Alex Morgan");
  const [newClubTreasurerEmail, setNewClubTreasurerEmail] = useState<string>("treasurer@club.org");
  const [newClubTagName, setNewClubTagName] = useState<string>("Club Operations");
  const [newClubTagLimit, setNewClubTagLimit] = useState<string>("500.00");
  const [newClubStartingBalance, setNewClubStartingBalance] = useState<string>("0.00");
  const [creatingClub, setCreatingClub] = useState<boolean>(false);

  // Modals State
  const [showSendModal, setShowSendModal] = useState<boolean>(false);
  const [showRequestModal, setShowRequestModal] = useState<boolean>(false);

  // Modal Inputs
  const [sendEmail, setSendEmail] = useState<string>("member@roboticsclub.org");
  const [sendAmount, setSendAmount] = useState<string>("25.00");
  const [sendTagId, setSendTagId] = useState<string>("");
  const [sendNote, setSendNote] = useState<string>("Hardware reimbursement");
  const [sendIsClub, setSendIsClub] = useState<boolean>(false);
  const [recipientSummary, setRecipientSummary] = useState<RecipientSummary | null>(null);

  const [reqEmail, setReqEmail] = useState<string>("jordan@roboticsclub.org");
  const [reqName, setReqName] = useState<string>("Jordan Lee");
  const [reqAmount, setReqAmount] = useState<string>("35.00");
  const [reqTagId, setReqTagId] = useState<string>("");
  const [reqNote, setReqNote] = useState<string>("November Club Dues");
  const [reqIsClub, setReqIsClub] = useState<boolean>(true);

  // Toast Action Notice
  const [actionNotice, setActionNotice] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // Success Tick Animation Modal State
  const [paymentSuccessData, setPaymentSuccessData] = useState<{
    title: string;
    amount?: number | string;
    recipient?: string;
    refId?: string;
    note?: string;
  } | null>(null);

  const triggerPaymentSuccess = (data: {
    title: string;
    amount?: number | string;
    recipient?: string;
    refId?: string;
    note?: string;
  }) => {
    setPaymentSuccessData(data);
  };

  // Global Multi-Currency Support (USD, EUR, GBP)
  type SupportedCurrency = "USD" | "EUR" | "GBP";
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>("USD");

  const currencyRates: Record<SupportedCurrency, { symbol: string; rate: number; label: string }> = {
    USD: { symbol: "$", rate: 1.0, label: "USD ($)" },
    EUR: { symbol: "€", rate: 0.92, label: "EUR (€)" },
    GBP: { symbol: "£", rate: 0.79, label: "GBP (£)" },
  };

  const formatCurrency = (amountInUsd: number | string | undefined | null) => {
    const num = typeof amountInUsd === "string" ? parseFloat(amountInUsd) || 0 : (amountInUsd ?? 0);
    const config = currencyRates[selectedCurrency] || currencyRates.USD;
    const converted = num * config.rate;
    return `${config.symbol}${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Digital Receipt Modal State
  const [viewingReceiptMovement, setViewingReceiptMovement] = useState<Movement | null>(null);

  // Profile Modal State & QR
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [qrAmount, setQrAmount] = useState<string>("");
  const [qrNote, setQrNote] = useState<string>("Payment to " + currentSessionName);
  const [qrSeed, setQrSeed] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // One-Click Export Ledger to CSV
  const exportLedgerToCsv = () => {
    if (movements.length === 0) {
      setActionNotice({ text: "No movements to export.", type: "info" });
      return;
    }
    const headers = [
      "Transaction ID",
      "Date (UTC)",
      "Type",
      "Direction",
      "Counterparty",
      "Amount",
      "Currency",
      "Category Tag",
      "Status",
      "PayPal Ref ID",
      "Notes",
      "Organization / Entity"
    ];
    const rows = movements.map((m) => [
      `"${m.id}"`,
      `"${new Date(m.createdAt).toISOString()}"`,
      `"${m.type}"`,
      `"${m.direction}"`,
      `"${(m.counterparty || "").replace(/"/g, '""')}"`,
      m.amount.toFixed(2),
      `"${m.currency || selectedCurrency}"`,
      `"${(m.tag?.name || "").replace(/"/g, '""')}"`,
      `"${m.status}"`,
      `"${m.paypalRefId || ""}"`,
      `"${(m.note || "").replace(/"/g, '""')}"`,
      `"${(m.club?.name || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orbit-ledger-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setActionNotice({ text: "📥 Ledger exported successfully as CSV!", type: "success" });
  };

  // Auto-fetch recipient summary for Send screen / modal
  useEffect(() => {
    if (!sendEmail || !sendEmail.includes("@")) {
      setRecipientSummary(null);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/recipients/summary?email=${encodeURIComponent(sendEmail.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) setRecipientSummary(data);
        })
        .catch((err) => console.error("Error fetching recipient summary:", err));
    }, 250);
    return () => clearTimeout(timer);
  }, [sendEmail, movements]);

  // 1. Fetch Client ID
  useEffect(() => {
    setQrSeed(Date.now());
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.clientId) setClientId(data.clientId);
        setLoadingConfig(false);
      })
      .catch((err) => {
        console.error("Config fetch error:", err);
        setLoadingConfig(false);
      });
  }, []);

  // 2. Fetch Data
  const fetchCart = useCallback(async () => {
    try {
      const res = await fetch("/api/cart");
      const data = await res.json();
      if (data.items) {
        setCartItems(data.items);
        setCartTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to load cart:", err);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags/spending");
      const data = await res.json();
      if (data.tags) {
        setTags(data.tags);
        if (!selectedTagId && data.tags.length > 0) {
          setSelectedTagId(data.tags[0].id);
          setSendTagId(data.tags[0].id);
          setReqTagId(data.tags[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load tags:", err);
    }
  }, [selectedTagId]);

  const fetchClubs = useCallback(async () => {
    try {
      const res = await fetch("/api/clubs");
      const data = await res.json();
      if (data.clubs && data.clubs.length > 0) {
        setClubs(data.clubs);
        setActiveClub((prev) => {
          if (!prev) return data.clubs[0];
          const found = data.clubs.find((c: Club) => c.id === prev.id);
          return found || data.clubs[0];
        });
      }
    } catch (err) {
      console.error("Failed to load clubs:", err);
    }
  }, []);

  const fetchMovements = useCallback(async () => {
    try {
      const res = await fetch("/api/movements");
      const data = await res.json();
      if (data.movements) {
        setMovements(data.movements);
      }
    } catch (err) {
      console.error("Failed to load movements:", err);
    }
  }, []);

  const fetchClubDues = useCallback(async (clubId: string) => {
    try {
      const res = await fetch(`/api/clubs/${clubId}/dues`);
      const data = await res.json();
      if (data.duesCycles) setDuesCycles(data.duesCycles);
    } catch (err) {
      console.error("Failed to load club dues:", err);
    }
  }, []);

  const fetchClubClaims = useCallback(async (clubId: string) => {
    try {
      const res = await fetch(`/api/clubs/${clubId}/claims`);
      const data = await res.json();
      if (data.claims) setClaims(data.claims);
    } catch (err) {
      console.error("Failed to load club claims:", err);
    }
  }, []);

  const fetchClubLedger = useCallback(async (clubId: string) => {
    try {
      const res = await fetch(`/api/clubs/${clubId}/ledger`);
      const data = await res.json();
      if (data.auditLogs) setClubAuditLogs(data.auditLogs);
    } catch (err) {
      console.error("Failed to load club ledger:", err);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (data.events) {
        setEvents(data.events);
        if (data.events.length > 0 && !selectedEventId) {
          setSelectedEventId(data.events[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load events:", err);
    }
  }, [selectedEventId]);

  const fetchSplits = useCallback(async () => {
    try {
      const res = await fetch("/api/splits");
      const data = await res.json();
      if (data.splits) setSplits(data.splits);
    } catch (err) {
      console.error("Failed to load splits:", err);
    }
  }, []);

  const refreshActiveClubData = useCallback(() => {
    if (activeClub) {
      fetchClubDues(activeClub.id);
      fetchClubClaims(activeClub.id);
      fetchClubLedger(activeClub.id);
      fetchClubs();
      fetchMovements();
      fetchEvents();
      fetchSplits();
    }
  }, [activeClub, fetchClubDues, fetchClubClaims, fetchClubLedger, fetchClubs, fetchMovements, fetchEvents, fetchSplits]);

  useEffect(() => {
    if (activeClub) {
      fetchClubDues(activeClub.id);
      fetchClubClaims(activeClub.id);
      fetchClubLedger(activeClub.id);
    }
  }, [activeClub, fetchClubDues, fetchClubClaims, fetchClubLedger]);

  useEffect(() => {
    fetchCart();
    fetchTags();
    fetchClubs();
    fetchMovements();
    fetchEvents();
    fetchSplits();
  }, [fetchCart, fetchTags, fetchClubs, fetchMovements, fetchEvents, fetchSplits]);

  // Fundraiser Contribution Handler (Payments via Orders tagged to event)
  const handleDonateToEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventId = selectedEventId || events[0]?.id;
    if (!eventId) return;

    setDonatingToEvent(true);
    setDonationSuccessMsg(null);
    try {
      // 1. Create PayPal Order tagged to the event
      const donateRes = await fetch(`/api/events/${eventId}/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(eventDonationAmount),
          donorEmail: eventDonorEmail || currentSessionEmail,
          donorName: eventDonorName || currentSessionName,
        }),
      });

      const donateData = await donateRes.json();
      if (!donateRes.ok || !donateData.success) {
        throw new Error(donateData.error || "Failed to initiate donation order.");
      }

      // 2. Authoritatively capture the PayPal Order
      const captureRes = await fetch(`/api/events/${eventId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: donateData.orderId,
          simulateSandbox: true,
        }),
      });

      const captureData = await captureRes.json();
      if (!captureRes.ok || !captureData.success) {
        throw new Error(captureData.error || "Failed to capture contribution.");
      }

      setDonationSuccessMsg(
        `🎉 Successfully contributed $${parseFloat(eventDonationAmount).toFixed(2)} via PayPal Order (ID: ${donateData.orderId})! The progress bar and club ledger updated instantly.`
      );
      fetchEvents();
      refreshActiveClubData();
    } catch (err: any) {
      alert(err.message || "Contribution failed.");
    } finally {
      setDonatingToEvent(false);
    }
  };

  // Launch Fundraiser Handler (Treasurer only)
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClub) return;

    if (role !== "TREASURER") {
      alert("Only the Treasurer can launch new event fundraisers.");
      return;
    }

    setCreatingEvent(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newEventTitle,
          description: newEventDesc,
          goalAmount: parseFloat(newEventGoal),
          clubId: activeClub.id,
          userEmail: currentSessionEmail,
          userRole: role,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to launch event.");
      }

      setNewEventTitle("");
      setNewEventDesc("");
      fetchEvents();
      refreshActiveClubData();
      alert("🚀 Event Fundraiser launched successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to launch event.");
    } finally {
      setCreatingEvent(false);
    }
  };

  // Bill Split Handlers
  const handleCreateSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (splitSelectedMembers.length === 0) {
      alert("Please select at least one member to split the bill with.");
      return;
    }

    setCreatingSplit(true);
    setSplitSuccessMsg(null);
    try {
      const res = await fetch("/api/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: splitTitle,
          totalAmount: parseFloat(splitTotal),
          memberEmails: splitSelectedMembers,
          includeCreator: splitIncludeCreator,
          creatorEmail: currentSessionEmail,
          clubId: activeClub?.id || null,
          tagId: selectedTagId || tags[0]?.id || null,
          userRole: role,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create bill split.");
      }

      setSplitSuccessMsg(
        `🎉 Created bill split "${data.split.title}"! ${data.requestsCreated} Invoicing request(s) issued via PayPal with in-code penny reconciliation.`
      );
      fetchSplits();
      fetchMovements();
      refreshActiveClubData();
    } catch (err: any) {
      alert(err.message || "Split creation failed.");
    } finally {
      setCreatingSplit(false);
    }
  };

  const handleSettleSplitRequest = async (splitId: string, movementId: string) => {
    setSettlingMovementId(movementId);
    try {
      const res = await fetch(`/api/splits/${splitId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movementId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to settle request.");
      }
      triggerPaymentSuccess({
        title: "Split Share Settled",
        amount: data.amount,
        recipient: "Group Expense Settled",
        refId: movementId,
        note: "Split bill payment recorded & completed",
      });
      fetchSplits();
      fetchMovements();
      refreshActiveClubData();
    } catch (err: any) {
      alert(err.message || "Settling failed.");
    } finally {
      setSettlingMovementId(null);
    }
  };

  // Delete Split Bill Expense Record
  const handleDeleteSplit = async (splitId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete the split expense "${title}"? This will cancel any pending split requests.`)) {
      return;
    }
    setDeletingSplitId(splitId);
    try {
      const res = await fetch(`/api/splits/${splitId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete split bill.");
      }
      setActionNotice({
        text: `🗑️ ${data.message || "Split bill deleted successfully."}`,
        type: "success",
      });
      fetchSplits();
      fetchMovements();
      refreshActiveClubData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete split bill";
      setActionNotice({ text: msg, type: "error" });
    } finally {
      setDeletingSplitId(null);
    }
  };

  // Create Dues Cycle (Treasurer only)
  const handleCreateDuesCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClub) return;
    if (role !== "TREASURER") {
      setActionNotice({
        text: "403 Forbidden: Only the Treasurer can issue dues requests (server-checked).",
        type: "error",
      });
      return;
    }
    setCreatingDues(true);
    try {
      const res = await fetch(`/api/clubs/${activeClub.id}/dues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newDuesTitle,
          amount: newDuesAmount,
          dueDate: newDuesDueDate,
          userRole: role,
          userEmail: currentSessionEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ text: data.error || "Failed to create dues cycle", type: "error" });
        return;
      }
      setActionNotice({
        text: `Dues cycle "${data.duesCycle.title}" created! Invoiced ${data.invoicesCreated} members via PayPal.`,
        type: "success",
      });
      refreshActiveClubData();
    } catch (err) {
      console.error("Dues creation error:", err);
      setActionNotice({ text: "Network error creating dues cycle", type: "error" });
    } finally {
      setCreatingDues(false);
    }
  };

  // Submit Reimbursement Claim (Members & Treasurer)
  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClub) return;
    setSubmittingClaim(true);
    try {
      const res = await fetch(`/api/clubs/${activeClub.id}/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterEmail: currentSessionEmail,
          requesterName: currentSessionName,
          amount: claimAmount,
          tagId: claimTagId || selectedTagId,
          note: claimNote,
          userRole: role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ text: data.error || "Failed to submit claim", type: "error" });
        return;
      }
      setActionNotice({
        text: `Claim submitted ($${parseFloat(claimAmount).toFixed(2)})! Awaiting Treasurer review.`,
        type: "success",
      });
      setClaimNote("");
      refreshActiveClubData();
    } catch (err) {
      console.error("Claim submission error:", err);
      setActionNotice({ text: "Network error submitting claim", type: "error" });
    } finally {
      setSubmittingClaim(false);
    }
  };

  // Approve & Disburse Claim (Treasurer only, with Exactly-Once & Self-Approval handling)
  const handleApproveClaim = async (claim: ReimbursementClaimView, isCertified = false) => {
    if (!activeClub) return;
    if (role !== "TREASURER") {
      setActionNotice({
        text: "403 Forbidden: Only the Treasurer can approve claims (server-checked).",
        type: "error",
      });
      return;
    }

    const isSelfApproval = claim.requesterEmail.toLowerCase() === currentSessionEmail.toLowerCase();
    if (isSelfApproval && !isCertified) {
      setClaimToApprove(claim);
      setSelfCertified(false);
      return;
    }

    setApprovingClaim(true);
    try {
      const res = await fetch(`/api/clubs/${activeClub.id}/claims/${claim.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approverEmail: currentSessionEmail,
          userRole: role,
          selfCertified: isCertified,
          simulateSandbox: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ text: data.error || "Approval failed", type: "error" });
        return;
      }
      setClaimToApprove(null);
      setActionNotice({
        text: `Claim ${claim.id.slice(-6)} APPROVED & PAID ($${claim.amount.toFixed(
          2
        )})! Payout Movement recorded in ledger.`,
        type: "success",
      });
      refreshActiveClubData();
      fetchTags();
    } catch (err) {
      console.error("Approval error:", err);
      setActionNotice({ text: "Network error approving claim", type: "error" });
    } finally {
      setApprovingClaim(false);
    }
  };

  // Reject Claim (Treasurer only)
  const handleRejectClaim = async (claimId: string) => {
    if (!activeClub) return;
    if (role !== "TREASURER") {
      setActionNotice({
        text: "403 Forbidden: Only the Treasurer can decline claims (server-checked).",
        type: "error",
      });
      return;
    }
    try {
      const res = await fetch(`/api/clubs/${activeClub.id}/claims/${claimId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Declined by Treasurer",
          userRole: role,
          userEmail: currentSessionEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ text: data.error || "Rejection failed", type: "error" });
        return;
      }
      setActionNotice({ text: "Claim rejected and marked DECLINED.", type: "info" });
      refreshActiveClubData();
    } catch (err) {
      console.error("Rejection error:", err);
      setActionNotice({ text: "Network error rejecting claim", type: "error" });
    }
  };

  // Search Products via Channel3
  const searchProducts = async (query?: string) => {
    const q = query || searchQuery;
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/products?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.products) setProducts(data.products);
    } catch (err) {
      console.error("Product search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  // Step 7: AI Copilot Command Handlers
  const handleRunAiCommand = async (customQuery?: string) => {
    const q = (customQuery || aiQuery).trim();
    if (!q) return;
    if (customQuery) setAiQuery(customQuery);
    setCopilotOpen(true);
    setAiLoading(true);
    setAiError(null);
    setAiConfirmedResult(null);
    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "x-user-email": currentSessionEmail,
        },
        body: JSON.stringify({
          query: q,
          context: { clubId: activeClub?.id },
          userRole: role,
          userEmail: currentSessionEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setAiError(data.responseText || data.error || "AI is busy, try again.");
        setAiResponse({
          text: data.responseText || "AI is busy, try again. (All standard Orbit financial features remain fully operational.)",
          toolCalls: data.toolCalls || [],
          draftAction: null,
        });
      } else {
        setAiResponse({
          text: data.responseText || "",
          toolCalls: data.toolCalls || [],
          draftAction: data.draftAction || null,
        });
      }
    } catch (err: any) {
      console.error("AI command error:", err);
      setAiError("AI is busy, try again. (All standard Orbit financial features remain fully operational.)");
    } finally {
      setAiLoading(false);
    }
  };

  const handleConsolidateContact = (counterparty: string) => {
    setSelectedContactForModal(null);
    setCopilotOpen(true);
    const q = `consolidate payments for ${counterparty}`;
    setAiQuery(q);
    handleRunAiCommand(q);
  };

  const handleConfirmAiDraft = async () => {
    if (!aiResponse?.draftAction) return;
    setAiConfirming(true);
    try {
      const res = await fetch("/api/ai/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
          "x-user-email": currentSessionEmail,
        },
        body: JSON.stringify({
          draftType: aiResponse.draftAction.draftType,
          data: aiResponse.draftAction.data,
          userRole: role,
          userEmail: currentSessionEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionNotice({
          text: data.error || "Failed to confirm drafted action",
          type: "error",
        });
        return;
      }
      setAiConfirmedResult({
        message: data.message || "Action successfully executed & recorded in unified ledger!",
        movementId: data.movement?.id || data.cycle?.id,
      });
      // Clear drafted action
      setAiResponse((prev) => (prev ? { ...prev, draftAction: null } : null));
      setActionNotice({
        text: `✓ ${data.message || "Action executed successfully!"}`,
        type: "success",
      });
      triggerPaymentSuccess({
        title: "Action Executed & Verified",
        amount: data.movement?.amount || aiResponse?.draftAction?.data?.amount,
        recipient: data.movement?.counterparty || aiResponse?.draftAction?.data?.recipientEmail,
        refId: data.movement?.paypalRefId || data.movement?.id,
        note: aiResponse?.draftAction?.summary || data.message,
      });
      // Refresh live system data
      fetchMovements();
      fetchTags();
      refreshActiveClubData();
    } catch (err: any) {
      console.error("Confirm error:", err);
      setActionNotice({ text: "Network error executing confirmed draft", type: "error" });
    } finally {
      setAiConfirming(false);
    }
  };

  const handleDismissAiDraft = () => {
    setAiResponse((prev) => (prev ? { ...prev, draftAction: null } : null));
  };

  // Add Product to Cart
  const handleAddToCart = async (p: Product) => {
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: p.id,
          title: p.title,
          unitPrice: p.cheapestPrice,
          quantity: 1,
          imageUrl: p.imageUrl,
          offerUrl: p.offerUrl,
        }),
      });
      if (res.ok) {
        fetchCart();
        setActionNotice({
          text: `Added "${p.title.slice(0, 25)}..." to your cart!`,
          type: "success",
        });
      }
    } catch (err) {
      console.error("Add to cart error:", err);
    }
  };

  // Cart quantity controls
  const handleUpdateQty = async (id: string, delta: number) => {
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;
    const newQty = item.quantity + delta;
    try {
      await fetch(`/api/cart/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty }),
      });
      fetchCart();
    } catch (err) {
      console.error("Qty update error:", err);
    }
  };

  const handleRemoveCartItem = async (id: string) => {
    try {
      await fetch(`/api/cart/${id}`, { method: "DELETE" });
      fetchCart();
    } catch (err) {
      console.error("Remove cart item error:", err);
    }
  };

  // Instant Dev Test Checkout
  const handleDevTestCheckout = async () => {
    if (cartItems.length === 0) {
      setActionNotice({ text: "Cart is empty. Add products first.", type: "error" });
      return;
    }
    try {
      const res = await fetch("/api/orders/dev-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: selectedTagId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice({
          text: `Dev Checkout Success: Order ${data.orderId} recorded COMPLETED in unified ledger!`,
          type: "success",
        });
        triggerPaymentSuccess({
          title: "Order Payment Successful",
          amount: cartTotal,
          recipient: "Instamart Store Checkout",
          refId: data.orderId,
          note: `${cartItems.length} item(s) purchased via Channel3 store`,
        });
        await fetch("/api/cart", { method: "DELETE" });
        fetchCart();
        fetchMovements();
        fetchTags();
      }
    } catch (err) {
      console.error("Dev checkout failed:", err);
    }
  };

  // Handle Club selection from scroll-down dropdown menu
  const handleSelectClub = (clubId: string) => {
    if (clubId === "__ADD_NEW__") {
      setShowAddClubModal(true);
      return;
    }
    const selected = clubs.find((c) => c.id === clubId);
    if (selected) {
      setActiveClub(selected);
      fetchClubDues(selected.id);
      fetchClubClaims(selected.id);
      fetchClubLedger(selected.id);
    }
  };

  // Create New Club with required/obvious details
  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClubName.trim()) {
      setActionNotice({ text: "Please provide a club name.", type: "error" });
      return;
    }
    setCreatingClub(true);
    try {
      const res = await fetch("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClubName.trim(),
          description: newClubDescription.trim() || undefined,
          treasurerName: newClubTreasurerName.trim() || undefined,
          treasurerEmail: newClubTreasurerEmail.trim() || undefined,
          tagName: newClubTagName.trim() || undefined,
          monthlyLimit: parseFloat(newClubTagLimit) || 500,
          startingBalance: parseFloat(newClubStartingBalance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create club");
      }

      if (data.club) {
        setClubs((prev) => [...prev, data.club]);
        setActiveClub(data.club);
        fetchClubDues(data.club.id);
        fetchClubClaims(data.club.id);
        fetchClubLedger(data.club.id);
        fetchTags();
        fetchMovements();
      } else {
        await fetchClubs();
      }

      setShowAddClubModal(false);
      const createdName = newClubName.trim();
      const depositVal = parseFloat(newClubStartingBalance);

      // Reset input form
      setNewClubName("");
      setNewClubDescription("");
      setNewClubTagName("Club Operations");
      setNewClubTagLimit("500.00");
      setNewClubStartingBalance("0.00");

      triggerPaymentSuccess({
        title: `Club "${createdName}" Created!`,
        amount: depositVal > 0 ? depositVal : undefined,
        recipient: newClubTreasurerEmail,
        note: `Treasury vault initialized for ${createdName}`,
      });

      setActionNotice({
        text: `🏛️ Club "${createdName}" created and activated!`,
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create club";
      setActionNotice({ text: msg, type: "error" });
    } finally {
      setCreatingClub(false);
    }
  };

  // Send Money (Payouts)
  const handleSendMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionNotice(null);
    try {
      const res = await fetch("/api/movements/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: sendEmail,
          amount: sendAmount,
          tagId: sendTagId || selectedTagId,
          note: sendNote,
          clubId: sendIsClub && activeClub ? activeClub.id : null,
          userRole: role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ text: data.error || "Failed to send payout", type: "error" });
        return;
      }
      setShowSendModal(false);
      setActionNotice({
        text: `Payout initiated! PayPal Batch ID: ${data.movement.paypalRefId}`,
        type: "success",
      });
      triggerPaymentSuccess({
        title: "Payout Sent Successfully",
        amount: parseFloat(sendAmount) || 0,
        recipient: sendEmail,
        refId: data.movement?.paypalRefId || data.movement?.id,
        note: sendNote || "Direct Transfer",
      });
      fetchMovements();
      fetchTags();
      fetchClubs();
    } catch (err) {
      console.error("Send error:", err);
      setActionNotice({ text: "Network error sending payout", type: "error" });
    }
  };

  // Request Money (Invoicing)
  const handleRequestMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionNotice(null);
    try {
      const res = await fetch("/api/movements/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: reqEmail,
          recipientName: reqName,
          amount: reqAmount,
          tagId: reqTagId || selectedTagId,
          note: reqNote,
          clubId: reqIsClub && activeClub ? activeClub.id : null,
          userRole: role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ text: data.error || "Failed to create invoice", type: "error" });
        return;
      }
      setShowRequestModal(false);
      setActionNotice({
        text: `Invoice sent! Invoice ID: ${data.movement.paypalRefId}`,
        type: "success",
      });
      fetchMovements();
      fetchTags();
      fetchClubs();
    } catch (err) {
      console.error("Request error:", err);
      setActionNotice({ text: "Network error sending invoice", type: "error" });
    }
  };

  // Sync Movement Status
  const handleRefreshMovement = async (id: string) => {
    try {
      const res = await fetch(`/api/movements/${id}/refresh`, { method: "POST" });
      const data = await res.json();
      setActionNotice({
        text: data.changed
          ? `Status updated to ${data.movement.status}`
          : `Confirmed status: ${data.movement.status}`,
        type: "info",
      });
      fetchMovements();
      fetchTags();
      fetchClubs();
    } catch (err) {
      console.error("Refresh movement error:", err);
    }
  };

  // Simulate Paid for Invoices
  const handleSimulatePaid = async (id: string) => {
    try {
      const res = await fetch(`/api/movements/${id}/simulate-paid`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setActionNotice({
          text: `Invoice marked PAID. Unified ledger and treasury balance updated!`,
          type: "success",
        });
        triggerPaymentSuccess({
          title: "Payment Received & Settled",
          amount: data.movement?.amount,
          recipient: data.movement?.counterparty || "Direct Payer",
          refId: data.movement?.paypalRefId || data.movement?.id,
          note: "Invoice marked as paid in unified ledger",
        });
        fetchMovements();
        fetchTags();
        fetchClubs();
      } else {
        setActionNotice({ text: data.error, type: "error" });
      }
    } catch (err) {
      console.error("Simulate payment error:", err);
    }
  };

  // Create Tag
  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim() || !newTagLimit.trim()) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName, monthlyLimit: newTagLimit }),
      });
      if (res.ok) {
        setNewTagName("");
        setNewTagLimit("");
        setShowAddTag(false);
        fetchTags();
      }
    } catch (err) {
      console.error("Create tag error:", err);
    }
  };

  // Update Tag (edit monthly limit for Food, Games, etc.)
  const handleUpdateTag = async (e: React.FormEvent, tagId: string) => {
    e.preventDefault();
    if (!editTagLimit.trim()) return;
    const numLimit = parseFloat(editTagLimit);
    if (isNaN(numLimit) || numLimit <= 0) {
      setActionNotice({ text: "Monthly limit must be a positive number.", type: "error" });
      return;
    }
    setSavingTag(true);
    try {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editTagName.trim() || undefined,
          monthlyLimit: numLimit,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice({
          text: `Updated "${data.tag.name}" budget to $${data.tag.monthlyLimit.toFixed(2)}/month!`,
          type: "success",
        });
        setEditingTagId(null);
        fetchTags();
      } else {
        setActionNotice({
          text: data.error || "Failed to update tag",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Update tag error:", err);
      setActionNotice({ text: "Network error updating tag", type: "error" });
    } finally {
      setSavingTag(false);
    }
  };

  // Tag budget calculation for cart checkout
  const activeSelectedTag = tags.find((t) => t.id === selectedTagId);
  const cartImpactProjected = activeSelectedTag
    ? activeSelectedTag.spent + cartTotal
    : 0;
  const isOver100 =
    activeSelectedTag && cartImpactProjected > activeSelectedTag.monthlyLimit;
  const isOver80 =
    activeSelectedTag &&
    !isOver100 &&
    (cartImpactProjected / activeSelectedTag.monthlyLimit) * 100 >= 80;

  return (
    <div>
      {/* 1. TOP NOTICE ANNOUNCEMENT BAR (Dismissible) */}
      {!dismissTopNotice && (
        <div className="top-notice-bar">
          <div className="top-notice-content">
            <span className="top-notice-badge">Sandbox</span>
            <span>Put Orbit in your pocket. Fast, server-authoritative community treasury.</span>
          </div>
          <button
            type="button"
            className="top-notice-close"
            onClick={() => setDismissTopNotice(true)}
            title="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. TOP BLUE NAVIGATION BAR */}
      <nav className="top-navbar">
        <div className="top-navbar-main">
          <div className="top-nav-left">
            <span
              className="brand-logo-text"
              onClick={() => setActiveTab("home")}
              style={{ cursor: "pointer" }}
            >
              ORBIT
            </span>

            {/* Desktop Navigation Links List */}
            <ul className="nav-links-list desktop-only-links">
              <li>
                <button
                  type="button"
                  className={`nav-link-btn ${activeTab === "home" ? "active" : ""}`}
                  onClick={() => setActiveTab("home")}
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`nav-link-btn ${activeTab === "send-request" ? "active" : ""}`}
                  onClick={() => setActiveTab("send-request")}
                >
                  Send & Request
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`nav-link-btn ${activeTab === "instamart" ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab("instamart");
                    if (products.length === 0) searchProducts("coffee");
                  }}
                >
                  Instamart
                  <span className="nav-badge-pill">Shop</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`nav-link-btn ${activeTab === "payment-methods" ? "active" : ""}`}
                  onClick={() => setActiveTab("payment-methods")}
                >
                  Payment Methods
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`nav-link-btn ${activeTab === "activity" ? "active" : ""}`}
                  onClick={() => setActiveTab("activity")}
                >
                  Activity
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`nav-link-btn ${activeTab === "club" ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab("club");
                    if (activeClub) {
                      fetchClubDues(activeClub.id);
                      fetchClubClaims(activeClub.id);
                      fetchClubLedger(activeClub.id);
                    }
                  }}
                >
                  Treasury
                  <span className="nav-badge-pill" style={{ background: "#7c3aed" }}>Vault</span>
                </button>
              </li>
            </ul>
          </div>

          <div className="top-nav-right">
            {/* Quick Tools: Copilot, Currency & Role Dropdown */}
            <div className="top-nav-tools-group" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              {/* Orbit Copilot Toggle Pill */}
              <button
                type="button"
                className="copilot-nav-toggle-btn"
                onClick={() => setCopilotOpen((prev) => !prev)}
                style={{
                  background: copilotOpen ? "rgba(255, 255, 255, 0.25)" : "linear-gradient(135deg, #4f46e5 0%, #009cde 100%)",
                  color: "#ffffff",
                  border: "1px solid rgba(255, 255, 255, 0.35)",
                  padding: "0.26rem 0.65rem",
                  borderRadius: "9999px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
                  transition: "all 0.2s ease",
                }}
                title="Toggle Orbit AI Copilot"
              >
                <span style={{ fontSize: "0.74rem" }}>✨</span>
                <span className="copilot-label-text">Copilot</span>
              </button>

              {/* Compact Currency Dropdown */}
              <div style={{ position: "relative", display: "inline-block" }}>
                <select
                  value={selectedCurrency}
                  onChange={(e) => {
                    const cur = e.target.value as SupportedCurrency;
                    setSelectedCurrency(cur);
                    setActionNotice({
                      text: `💱 Currency switched to ${cur} (${currencyRates[cur].symbol})`,
                      type: "info",
                    });
                  }}
                  style={{
                    background: "rgba(0, 0, 0, 0.28)",
                    color: "#ffffff",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    borderRadius: "9999px",
                    padding: "0.24rem 0.5rem",
                    fontSize: "0.74rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    outline: "none",
                    backdropFilter: "blur(4px)",
                  }}
                  title="Select Display Currency"
                >
                  <option value="USD" style={{ color: "#0f172a", background: "#ffffff" }}>
                    $ USD
                  </option>
                  <option value="EUR" style={{ color: "#0f172a", background: "#ffffff" }}>
                    € EUR
                  </option>
                  <option value="GBP" style={{ color: "#0f172a", background: "#ffffff" }}>
                    £ GBP
                  </option>
                </select>
              </div>

              {/* Compact Role Dropdown (converted from button capsule) */}
              <div style={{ position: "relative", display: "inline-block" }}>
                <select
                  value={role}
                  onChange={(e) => {
                    const newRole = e.target.value as "TREASURER" | "MEMBER";
                    setRole(newRole);
                    setActionNotice({
                      text: `👤 Switched demo role to ${newRole === "TREASURER" ? "Treasurer (Finance Controller)" : "Team Member"}`,
                      type: "info",
                    });
                  }}
                  style={{
                    background: role === "TREASURER" ? "rgba(16, 185, 129, 0.25)" : "rgba(2, 132, 199, 0.25)",
                    color: "#ffffff",
                    border: "1px solid rgba(255, 255, 255, 0.35)",
                    borderRadius: "9999px",
                    padding: "0.24rem 0.5rem",
                    fontSize: "0.74rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    outline: "none",
                    backdropFilter: "blur(4px)",
                  }}
                  title="Toggle Demo User Role"
                >
                  <option value="TREASURER" style={{ color: "#0f172a", background: "#ffffff" }}>
                    👑 Treasurer
                  </option>
                  <option value="MEMBER" style={{ color: "#0f172a", background: "#ffffff" }}>
                    👤 Member
                  </option>
                </select>
              </div>
            </div>

            {/* Compact Profile & Account Button in Top Right */}
            <button
              type="button"
              className={`profile-nav-btn ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
              title="My Profile & Scan-to-Pay QR Code"
              style={{
                background: activeTab === "profile" ? "#ffffff" : "rgba(255, 255, 255, 0.15)",
                border: activeTab === "profile" ? "1.5px solid #ffffff" : "1px solid rgba(255, 255, 255, 0.3)",
                borderRadius: "9999px",
                padding: "0.16rem 0.45rem 0.16rem 0.2rem",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                cursor: "pointer",
                color: activeTab === "profile" ? "#003087" : "#ffffff",
                boxShadow: activeTab === "profile" ? "0 4px 12px rgba(0,0,0,0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: activeTab === "profile" ? "#003087" : "linear-gradient(135deg, #0070ba 0%, #003087 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.64rem",
                  fontWeight: 900,
                  color: "#ffffff",
                  border: "1px solid rgba(255, 255, 255, 0.6)",
                  flexShrink: 0,
                }}
              >
                {role === "TREASURER" ? "AR" : "JL"}
              </div>
              <div className="profile-nav-text-block desktop-only" style={{ textAlign: "left", lineHeight: 1.1 }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, display: "block", color: activeTab === "profile" ? "#003087" : "#ffffff" }}>
                  {role === "TREASURER" ? "Alex R." : "Jordan L."}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Horizontal Scrollable Tab Strip (Visible on mobile <= 768px) */}
        <div className="mobile-subnav-strip">
          <ul className="nav-links-list-mobile">
            <li>
              <button
                type="button"
                className={`nav-link-btn ${activeTab === "home" ? "active" : ""}`}
                onClick={() => setActiveTab("home")}
              >
                Home
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`nav-link-btn ${activeTab === "send-request" ? "active" : ""}`}
                onClick={() => setActiveTab("send-request")}
              >
                Send & Request
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`nav-link-btn ${activeTab === "instamart" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("instamart");
                  if (products.length === 0) searchProducts("coffee");
                }}
              >
                Instamart
                <span className="nav-badge-pill">Shop</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`nav-link-btn ${activeTab === "payment-methods" ? "active" : ""}`}
                onClick={() => setActiveTab("payment-methods")}
              >
                Payment Methods
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`nav-link-btn ${activeTab === "activity" ? "active" : ""}`}
                onClick={() => setActiveTab("activity")}
              >
                Activity
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`nav-link-btn ${activeTab === "club" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("club");
                  if (activeClub) {
                    fetchClubDues(activeClub.id);
                    fetchClubClaims(activeClub.id);
                    fetchClubLedger(activeClub.id);
                  }
                }}
              >
                Treasury
                <span className="nav-badge-pill" style={{ background: "#7c3aed" }}>Vault</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`nav-link-btn ${activeTab === "profile" ? "active" : ""}`}
                onClick={() => setActiveTab("profile")}
              >
                Profile & QR
                <span className="nav-badge-pill" style={{ background: "#10b981" }}>QR</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* 3. MAIN BODY CONTAINER */}
      <main className="app-container">
        {/* Toast Action Notice */}
        {actionNotice && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "0.85rem 1.25rem",
              borderRadius: "10px",
              background:
                actionNotice.type === "success"
                  ? "#ecfdf5"
                  : actionNotice.type === "error"
                  ? "#fef2f2"
                  : "#eff6ff",
              border: `1px solid ${
                actionNotice.type === "success"
                  ? "#a7f3d0"
                  : actionNotice.type === "error"
                  ? "#fecaca"
                  : "#bfdbfe"
              }`,
              color:
                actionNotice.type === "success"
                  ? "#047857"
                  : actionNotice.type === "error"
                  ? "#b91c1c"
                  : "#1d4ed8",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
            }}
          >
            <span style={{ fontWeight: 600 }}>{actionNotice.text}</span>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "1rem",
                color: "inherit",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW A: HOME DASHBOARD (Exact match to blueprint)    */}
        {/* ==================================================== */}
        {activeTab === "home" && (
          <div>
            {/* Step 7: ORBIT AI FINANCIAL & TREASURY COMMAND BAR (Minimizable & Dockable) */}
            <div className="ai-command-container">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span className="ai-header-badge">✨ Orbit Copilot</span>
                  <span className="desktop-only" style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>
                    Natural language financial commands, payment consolidation & ledger intelligence
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="desktop-only"
                    onClick={() => setCopilotDock(copilotDock === "right" ? "left" : "right")}
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      color: "#475569",
                      padding: "0.25rem 0.65rem",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                    title="Switch side dock position"
                  >
                    Dock: {copilotDock === "right" ? "Right ➔" : "⬅ Left"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopilotMinimizedInline(!copilotMinimizedInline)}
                    style={{
                      background: copilotMinimizedInline ? "#003087" : "#f1f5f9",
                      color: copilotMinimizedInline ? "#ffffff" : "#475569",
                      border: "1px solid #cbd5e1",
                      padding: "0.25rem 0.65rem",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {copilotMinimizedInline ? "Extend Copilot ↗" : "— Minimize"}
                  </button>
                  <span className="desktop-only" style={{ fontSize: "0.75rem", background: "#f1f5f9", padding: "0.2rem 0.55rem", borderRadius: "6px", color: "#475569", fontWeight: 700 }}>
                    Active Model: Gemini 2.5/3.5 Flash
                  </span>
                </div>
              </div>

              {!copilotMinimizedInline && (
                <>
                  {/* Command Bar Input */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRunAiCommand();
                    }}
                    className="ai-input-wrapper"
                    style={{ marginTop: "0.85rem" }}
                  >
                    <span style={{ fontSize: "1.1rem" }}>💬</span>
                    <input
                      type="text"
                      className="ai-command-input"
                      placeholder="Ask a financial question, consolidate a contact, or draft an action (e.g. 'consolidate payments for Jordan', 'Food limit?')..."
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="ai-submit-btn"
                      disabled={aiLoading || !aiQuery.trim()}
                    >
                      {aiLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: "14px", height: "14px", border: "2px solid #ffffff", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
                          <span>Thinking...</span>
                        </>
                      ) : (
                        <>
                          <span>Ask AI</span>
                          <span>➔</span>
                        </>
                      )}
                    </button>
                  </form>

                  {/* Quick Suggestion Chips */}
                  <div className="ai-chips-row">
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                      Try asking:
                    </span>
                    {[
                      { label: "🔮 Predict Burn-Rate & Overspends", query: "analyze this month's burn rate and predict budget overspends" },
                      { label: "📊 Consolidate Jordan (Engineering)", query: "consolidate payments for jordan@roboticsclub.org" },
                      { label: "🏢 Consolidate Apex Robotics", query: "consolidate payments for Apex Robotics Dynamics" },
                      { label: "💳 Food limit?", query: "how close am I to my Food limit?" },
                      { label: "📈 Where did our money go?", query: "where did our money go? Summarize recent spending from the ledger." },
                      { label: "⚡ Disburse $250 for Components", query: "draft sending $250 to jordan@roboticsclub.org for lab components" },
                      { label: "💰 Compute Retainers ($6,000 Budget)", query: "calculate retainers for a $6000 operating budget with 12 partners and a 10% contingency buffer" },
                      { label: "⚠️ Audit & Anomaly Detection", query: "audit our corporate treasury for any anomalies, spikes, or budget limit breaches" },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        className="ai-chip-pill"
                        onClick={() => {
                          setAiQuery(chip.query);
                          handleRunAiCommand(chip.query);
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  {/* Verified Execution Result Banner */}
                  {aiConfirmedResult && (
                    <div
                      style={{
                        marginTop: "1.25rem",
                        padding: "1rem 1.25rem",
                        background: "#ecfdf5",
                        border: "1.5px solid #a7f3d0",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        color: "#065f46",
                      }}
                    >
                      <span style={{ fontSize: "1.4rem" }}>✅</span>
                      <div>
                        <h5 style={{ fontWeight: 800, fontSize: "0.92rem", marginBottom: "0.15rem" }}>
                          Transaction Confirmed & Recorded
                        </h5>
                        <p style={{ fontSize: "0.82rem", margin: 0 }}>
                          {aiConfirmedResult.message}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* AI Synthesized Response Box */}
                  {(aiResponse || aiLoading) && (
                    <div className="ai-response-box">
                      {aiLoading ? (
                        <div style={{ padding: "0.75rem 0", display: "flex", alignItems: "center", gap: "0.75rem", color: "#6366f1" }}>
                          <span className="spinner-border" style={{ width: "20px", height: "20px", border: "2.5px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                          <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                            Querying unified ledger & executing mathematical models...
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* Tool Call Badges */}
                          {aiResponse?.toolCalls && aiResponse.toolCalls.length > 0 && (
                            <div style={{ marginBottom: "0.85rem", borderBottom: "1px dashed #e2e8f0", paddingBottom: "0.5rem" }}>
                              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginRight: "0.5rem" }}>
                                Tools Invoked:
                              </span>
                              {aiResponse.toolCalls.map((tc, idx) => (
                                <span key={idx} className="ai-tool-badge">
                                  ⚡ {tc.tool} ({tc.durationMs}ms)
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Beautiful Polished Response Text */}
                          {renderFormattedCopilotText(aiResponse?.text || "")}

                          {/* INTERACTIVE DRAFT CONFIRMATION CARD */}
                          {aiResponse?.draftAction && (
                            <div className="ai-draft-card">
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                                <div>
                                  <span className="ai-draft-badge">
                                    Action Draft: {aiResponse.draftAction.draftType}
                                  </span>
                                  <h4 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginTop: "0.4rem" }}>
                                    {aiResponse.draftAction.summary}
                                  </h4>
                                  <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" }}>
                                    Security Invariant: No funds move or records alter until you confirm.
                                  </p>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                                    Amount
                                  </span>
                                  <p className="ai-draft-amount-big">
                                    ${parseFloat(aiResponse.draftAction.data.amount || 0).toFixed(2)}
                                  </p>
                                </div>
                              </div>

                          {/* Draft Details Grid */}
                          <div
                            style={{
                              background: "#ffffff",
                              border: "1px solid #e2e8f0",
                              borderRadius: "10px",
                              padding: "0.85rem 1rem",
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                              gap: "0.75rem",
                              marginBottom: "1.25rem",
                              fontSize: "0.82rem",
                            }}
                          >
                            <div>
                              <span style={{ color: "#64748b", display: "block" }}>Counterparty</span>
                              <strong style={{ color: "#0f172a" }}>
                                {aiResponse.draftAction.data.recipientEmail || aiResponse.draftAction.data.payerEmail || "All Members"}
                              </strong>
                            </div>
                            <div>
                              <span style={{ color: "#64748b", display: "block" }}>Category Tag</span>
                              <strong style={{ color: "#0f172a" }}>
                                {aiResponse.draftAction.data.tagName || "Other"}
                              </strong>
                            </div>
                            <div>
                              <span style={{ color: "#64748b", display: "block" }}>Payment Note</span>
                              <strong style={{ color: "#0f172a" }}>
                                {aiResponse.draftAction.data.note || aiResponse.draftAction.data.title || "Direct Orbit Transfer"}
                              </strong>
                            </div>
                          </div>

                          {/* Limit Impact Warning if present */}
                          {aiResponse.draftAction.data.willExceedLimit && (
                            <div
                              style={{
                                background: "#fffbeb",
                                border: "1px solid #fde68a",
                                padding: "0.6rem 0.85rem",
                                borderRadius: "8px",
                                color: "#b45309",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                marginBottom: "1rem",
                              }}
                            >
                              ⚠️ Warning: This payment will exceed your monthly limit for category &ldquo;{aiResponse.draftAction.data.tagName}&rdquo;.
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                            <button
                              type="button"
                              className="ai-btn-confirm"
                              onClick={handleConfirmAiDraft}
                              disabled={aiConfirming}
                            >
                              {aiConfirming ? (
                                <>
                                  <span className="spinner-border spinner-border-sm" style={{ width: "14px", height: "14px", border: "2px solid #ffffff", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
                                  <span>Executing Transfer...</span>
                                </>
                              ) : (
                                <>
                                  <span>✓ Confirm & Execute</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              className="ai-btn-dismiss"
                              onClick={handleDismissAiDraft}
                              disabled={aiConfirming}
                            >
                              Dismiss Draft
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

            {/* Link card / debit notice */}
            <div className="card-link-banner">
              <div className="card-link-icon-circle">💳</div>
              <div>
                <h4 className="card-link-title">Link your debit or credit card</h4>
                <p className="card-link-desc">
                  Keep your financial info secure when buying online or funding club dues.
                </p>
              </div>
            </div>

            {/* TWO-COLUMN DASHBOARD */}
            <div className="dashboard-grid">
              {/* LEFT COLUMN */}
              <div className="dashboard-left-col">
                {/* 2 Big Action Cards (Pay someone / Get paid) */}
                <div className="promo-cards-row">
                  {/* Pay Someone Card */}
                  <div className="promo-action-card blue">
                    <div>
                      <div className="promo-card-graphic">⚽🛍️</div>
                      <h3 className="promo-card-title">Pay someone</h3>
                      <p className="promo-card-desc">
                        Pay for purchases or a service you received via PayPal Payouts.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-promo-white-pill"
                      onClick={() => {
                        setSendIsClub(false);
                        setShowSendModal(true);
                      }}
                    >
                      Send Payments
                    </button>
                  </div>

                  {/* Get Paid Card */}
                  <div className="promo-action-card dark-navy">
                    <div>
                      <div className="promo-card-graphic">🧾💬</div>
                      <h3 className="promo-card-title">Get paid</h3>
                      <p className="promo-card-desc">
                        Get paid for selling something or for the work you did via Invoicing v2.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-promo-white-pill"
                      onClick={() => {
                        setReqIsClub(false);
                        setShowRequestModal(true);
                      }}
                    >
                      Request Payments
                    </button>
                  </div>
                </div>

                {/* Instamart Express Feature Banner */}
                <div
                  className="section-card"
                  style={{
                    background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                    color: "#ffffff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <span
                      style={{
                        background: "rgba(255, 255, 255, 0.2)",
                        padding: "0.2rem 0.6rem",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      Instant Grocery & Hardware
                    </span>
                    <h3 style={{ fontSize: "1.35rem", fontWeight: 800, marginTop: "0.4rem" }}>
                      Instamart Express Catalog
                    </h3>
                    <p style={{ fontSize: "0.85rem", opacity: 0.9, marginTop: "0.2rem" }}>
                      Live Channel3 product search • Server cart • PayPal Orders checkout
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-promo-white-pill"
                    style={{ width: "auto", padding: "0.65rem 1.4rem" }}
                    onClick={() => {
                      setActiveTab("instamart");
                      if (products.length === 0) searchProducts("snacks");
                    }}
                  >
                    Open Instamart ➔
                  </button>
                </div>

                {/* Clubs & Treasury Section */}
                <div className="section-card">
                  <div className="section-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                        <h3 className="section-card-title" style={{ margin: 0 }}>
                          {activeClub ? activeClub.name : "Organization"} Treasury
                        </h3>
                        {/* Organization Dropdown Selector & Add Button */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <select
                            className="club-scroll-select"
                            value={activeClub?.id || ""}
                            onChange={(e) => handleSelectClub(e.target.value)}
                            style={{
                              background: "#f1f5f9",
                              border: "1.5px solid #cbd5e1",
                              color: "#0f172a",
                              padding: "0.3rem 0.75rem",
                              fontSize: "0.82rem",
                              fontWeight: 700,
                            }}
                            title="Switch active organization or entity"
                          >
                            {clubs.map((c) => (
                              <option key={c.id} value={c.id}>
                                🏢 {c.name} ({formatCurrency(c.balance)})
                              </option>
                            ))}
                            <option value="__ADD_NEW__" style={{ color: "#4f46e5", fontWeight: "bold" }}>
                              ➕ + Add New Organization...
                            </option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowAddClubModal(true)}
                            title="Create a new organization / business entity"
                            style={{
                              background: "#f0fdf4",
                              border: "1.5px solid #86efac",
                              color: "#166534",
                              borderRadius: "9999px",
                              padding: "0.28rem 0.65rem",
                              fontSize: "0.78rem",
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>+</span> New
                          </button>
                        </div>
                      </div>
                      <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                        {activeClub?.description || "Enterprise entity treasury, dues, receivables & operational disbursements"}
                      </p>
                    </div>
                    <span
                      style={{
                        background: role === "TREASURER" ? "#e0f2fe" : "#fef3c7",
                        color: role === "TREASURER" ? "#0369a1" : "#92400e",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        padding: "0.3rem 0.75rem",
                        borderRadius: "9999px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {role === "TREASURER" ? "Treasurer Authorized" : "Member View"}
                    </span>
                  </div>

                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #eef2f6",
                      borderRadius: "12px",
                      padding: "1.25rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          fontWeight: 700,
                        }}
                      >
                        Treasury Vault Balance
                      </span>
                      <p
                        style={{
                          fontSize: "1.75rem",
                          fontWeight: 900,
                          color: "#003087",
                          marginTop: "0.2rem",
                        }}
                      >
                        {formatCurrency(activeClub ? activeClub.balance : 1480)}
                      </p>
                    </div>

                    <div style={{ textAlign: "right", fontSize: "0.8rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Members:</span>
                      <p style={{ fontWeight: 700, color: "var(--text-main)" }}>
                        {activeClub ? activeClub.members.length : 3} active
                      </p>
                    </div>
                  </div>

                  <div className="responsive-btn-grid-2">
                    <button
                      type="button"
                      className="btn-navy-pill"
                      style={{ fontSize: "0.88rem", padding: "0.7rem 1rem" }}
                      onClick={() => {
                        if (role !== "TREASURER") {
                          setActionNotice({
                            text: "403 Forbidden: Only the Treasurer can issue dues requests (server-checked).",
                            type: "error",
                          });
                          return;
                        }
                        setReqIsClub(true);
                        setShowRequestModal(true);
                      }}
                    >
                      📩 Request Dues (Invoicing v2)
                    </button>

                    <button
                      type="button"
                      className="btn-navy-pill"
                      style={{
                        background: "#ffffff",
                        color: "#003087",
                        border: "1.5px solid #003087",
                        fontSize: "0.88rem",
                        padding: "0.7rem 1rem",
                      }}
                      onClick={() => {
                        if (role !== "TREASURER") {
                          setActionNotice({
                            text: "403 Forbidden: Only the Treasurer can disburse club reimbursements (server-checked).",
                            type: "error",
                          });
                          return;
                        }
                        setSendIsClub(true);
                        setShowSendModal(true);
                      }}
                    >
                      💸 Reimburse Member (Payouts v1)
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn-promo-white-pill"
                    style={{
                      marginTop: "0.75rem",
                      background: "#f8fafc",
                      color: "#003087",
                      border: "1.5px solid #cbd5e1",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      padding: "0.55rem 1rem",
                    }}
                    onClick={() => {
                      setActiveTab("club");
                      if (activeClub) {
                        fetchClubDues(activeClub.id);
                        fetchClubClaims(activeClub.id);
                        fetchClubLedger(activeClub.id);
                      }
                    }}
                  >
                    Open Organization Treasury Hub (Retainers, Claims, Ledger) ➔
                  </button>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="dashboard-right-col">
                {/* 2 Primary Action Pills (Send / Request) */}
                <div className="right-primary-actions">
                  <button
                    type="button"
                    className="btn-navy-pill btn-primary-send"
                    onClick={() => {
                      setSendIsClub(false);
                      setShowSendModal(true);
                    }}
                  >
                    <span>💸</span>
                    <span>Send</span>
                  </button>
                  <button
                    type="button"
                    className="btn-navy-pill btn-primary-request"
                    onClick={() => {
                      setReqIsClub(false);
                      setShowRequestModal(true);
                    }}
                  >
                    <span>📩</span>
                    <span>Request</span>
                  </button>
                </div>

                {/* Quick Shortcut Circles */}
                <div className="shortcuts-row">
                  <button
                    type="button"
                    className="shortcut-item"
                    onClick={() => setActiveTab("payment-methods")}
                  >
                    <div className="shortcut-circle-btn">🏦</div>
                    <span className="shortcut-label">Add card or bank</span>
                  </button>

                  <button
                    type="button"
                    className="shortcut-item"
                    onClick={() => {
                      setActiveTab("instamart");
                      if (products.length === 0) searchProducts("groceries");
                    }}
                  >
                    <div className="shortcut-circle-btn">🛒</div>
                    <span className="shortcut-label">Instamart Shop</span>
                  </button>

                  <button
                    type="button"
                    className="shortcut-item"
                    onClick={() => {
                      if (role === "TREASURER") {
                        setReqIsClub(true);
                        setShowRequestModal(true);
                      } else {
                        setActionNotice({
                          text: "403 Forbidden: Member view only for treasury actions.",
                          type: "error",
                        });
                      }
                    }}
                  >
                    <div className="shortcut-circle-btn">🏛️</div>
                    <span className="shortcut-label">Club Treasury</span>
                  </button>
                </div>

                {/* Banks and Cards Widget (Explicit User Requirement) */}
                <div className="section-card">
                  <div className="section-card-header">
                    <h3 className="section-card-title">Banks and cards</h3>
                    <button
                      type="button"
                      className="section-card-action-link"
                      onClick={() => setActiveTab("payment-methods")}
                    >
                      Manage ➔
                    </button>
                  </div>

                  <div className="bank-cards-list">
                    {/* Chase Checking */}
                    <div className="bank-card-row">
                      <div className="bank-card-left">
                        <div className="card-type-icon bank">BANK</div>
                        <div>
                          <p className="bank-card-title">Chase Premier Checking</p>
                          <span className="bank-card-sub">Checking •••• 9102</span>
                        </div>
                      </div>
                      <span className="bank-card-balance">$4,320.50</span>
                    </div>

                    {/* SVB Treasury Account */}
                    <div className="bank-card-row">
                      <div className="bank-card-left">
                        <div className="card-type-icon bank">BANK</div>
                        <div>
                          <p className="bank-card-title">SVB Treasury Account</p>
                          <span className="bank-card-sub">Operating •••• 3341</span>
                        </div>
                      </div>
                      <span className="bank-card-balance">$12,450.00</span>
                    </div>

                    {/* Visa Signature Credit Card */}
                    <div className="bank-card-row">
                      <div className="bank-card-left">
                        <div className="card-type-icon visa">VISA</div>
                        <div>
                          <p className="bank-card-title">Visa Signature Card</p>
                          <span className="bank-card-sub">Credit •••• 4242 (Exp 08/28)</span>
                        </div>
                      </div>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0070ba" }}>
                        $8,750 Avail
                      </span>
                    </div>

                    {/* Mastercard Debit Card */}
                    <div className="bank-card-row">
                      <div className="bank-card-left">
                        <div className="card-type-icon mastercard">MC</div>
                        <div>
                          <p className="bank-card-title">Mastercard Debit Card</p>
                          <span className="bank-card-sub">Debit •••• 8821 (Active)</span>
                        </div>
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Connected
                      </span>
                    </div>
                  </div>
                </div>

                {/* This Month's Tags (Spent vs Limit) */}
                <div className="section-card">
                  <div className="section-card-header">
                    <h3 className="section-card-title">This month&apos;s tags</h3>
                    <button
                      type="button"
                      className="section-card-action-link"
                      onClick={() => setShowAddTag(!showAddTag)}
                    >
                      {showAddTag ? "Close" : "+ Add Tag"}
                    </button>
                  </div>

                  {showAddTag && (
                    <form
                      onSubmit={handleCreateTag}
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "0.85rem",
                        marginBottom: "1rem",
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Tag Name (e.g. Travel)"
                        className="form-input-text"
                        style={{ flex: 1, minWidth: "120px", padding: "0.5rem" }}
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        required
                      />
                      <input
                        type="number"
                        placeholder="Limit ($)"
                        className="form-input-text"
                        style={{ width: "90px", padding: "0.5rem" }}
                        value={newTagLimit}
                        onChange={(e) => setNewTagLimit(e.target.value)}
                        required
                      />
                      <button
                        type="submit"
                        className="btn-navy-pill"
                        style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                      >
                        Save
                      </button>
                    </form>
                  )}

                  <div className="tag-bars-list">
                    {(showAllTags ? tags : tags.slice(0, 5)).map((t) => (
                      <div
                        key={t.id}
                        className={`tag-bar-item ${
                          t.status === "warning_80"
                            ? "warning-80"
                            : t.status === "exceeded_100"
                            ? "exceeded-100"
                            : ""
                        }`}
                      >
                        {editingTagId === t.id ? (
                          <div
                            style={{
                              background: "#ffffff",
                              border: "1.5px solid #0070ba",
                              borderRadius: "10px",
                              padding: "0.75rem",
                              marginBottom: "0.5rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "0.4rem",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.85rem",
                                  fontWeight: 800,
                                  color: "#003087",
                                }}
                              >
                                Edit Budget: {t.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingTagId(null)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--text-muted)",
                                  fontSize: "1rem",
                                }}
                              >
                                ✕
                              </button>
                            </div>
                            <form
                              onSubmit={(e) => handleUpdateTag(e, t.id)}
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                alignItems: "flex-end",
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ flex: 1, minWidth: "110px" }}>
                                <label
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "var(--text-secondary)",
                                    fontWeight: 700,
                                    display: "block",
                                    marginBottom: "0.2rem",
                                  }}
                                >
                                  Tag Name
                                </label>
                                <input
                                  type="text"
                                  className="form-input-text"
                                  value={editTagName}
                                  onChange={(e) => setEditTagName(e.target.value)}
                                  style={{ width: "100%", padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
                                  required
                                />
                              </div>
                              <div style={{ width: "110px" }}>
                                <label
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "var(--text-secondary)",
                                    fontWeight: 700,
                                    display: "block",
                                    marginBottom: "0.2rem",
                                  }}
                                >
                                  Limit ($)
                                </label>
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  className="form-input-text"
                                  value={editTagLimit}
                                  onChange={(e) => setEditTagLimit(e.target.value)}
                                  style={{ width: "100%", padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
                                  required
                                />
                              </div>
                              <div style={{ display: "flex", gap: "0.3rem" }}>
                                <button
                                  type="submit"
                                  disabled={savingTag}
                                  className="btn-navy-pill"
                                  style={{ padding: "0.4rem 0.9rem", fontSize: "0.82rem" }}
                                >
                                  {savingTag ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingTagId(null)}
                                  style={{
                                    background: "#f1f5f9",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: "9999px",
                                    padding: "0.4rem 0.75rem",
                                    fontSize: "0.82rem",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </div>
                        ) : (
                          <div className="tag-bar-header">
                            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                              <span className="tag-bar-name">{t.name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTagId(t.id);
                                  setEditTagName(t.name);
                                  setEditTagLimit(t.monthlyLimit.toString());
                                }}
                                title={`Edit ${t.name} monthly limit`}
                                style={{
                                  background: "rgba(0, 112, 186, 0.08)",
                                  border: "1px solid rgba(0, 112, 186, 0.2)",
                                  borderRadius: "6px",
                                  padding: "0.15rem 0.45rem",
                                  cursor: "pointer",
                                  color: "#0070ba",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.2rem",
                                }}
                              >
                                <span>✏️</span>
                                <span>Edit</span>
                              </button>
                            </div>
                            <span className="tag-bar-figures">
                              ${t.spent.toFixed(2)} / ${t.monthlyLimit.toFixed(2)}
                            </span>
                          </div>
                        )}

                        <div className="tag-track">
                          <div
                            className={`tag-fill ${t.status}`}
                            style={{
                              width: `${Math.min(100, Math.max(0, t.percentageUsed))}%`,
                            }}
                          />
                        </div>

                        <div className="tag-bar-footer">
                          <span>Remaining: ${t.remaining.toFixed(2)}</span>
                          <span style={{ fontWeight: 700 }}>
                            {t.status === "exceeded_100"
                              ? "🚨 Over Limit"
                              : t.status === "warning_80"
                              ? "⚠️ 80% Warning"
                              : `${t.percentageUsed}% used`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {tags.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTags(!showAllTags)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#0070ba",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        marginTop: "0.75rem",
                        display: "block",
                        width: "100%",
                        textAlign: "center",
                      }}
                    >
                      {showAllTags ? "Show top 5 tags ▲" : `Show all ${tags.length} tags ▼`}
                    </button>
                  )}
                </div>

                {/* Recent Activity Mini-Widget */}
                {/* Payment History & Contacts Mini-Widget */}
                <div className="section-card">
                  <div className="section-card-header">
                    <h3 className="section-card-title">Recent activity</h3>
                    <div>
                      <h3 className="section-card-title">Payment history & contacts</h3>
                      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                        Click any contact or payment to view consolidated stats
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={exportLedgerToCsv}
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          color: "#166534",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          padding: "0.25rem 0.65rem",
                          borderRadius: "9999px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                        title="Download CSV export"
                      >
                        📥 Export CSV
                      </button>
                      <button
                        type="button"
                        className="section-card-action-link"
                        onClick={() => setActiveTab("activity")}
                      >
                        View all ➔
                      </button>
                    </div>
                  </div>

                  {/* Sub-tabs: Recent Movements vs Top Contacts */}
                  <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.85rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                    <button
                      type="button"
                      onClick={() => setHistoryTab("movements")}
                      style={{
                        background: historyTab === "movements" ? "#003087" : "#f1f5f9",
                        color: historyTab === "movements" ? "#ffffff" : "#475569",
                        border: "none",
                        borderRadius: "9999px",
                        padding: "0.3rem 0.75rem",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      Recent Payments
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTab("contacts")}
                      style={{
                        background: historyTab === "contacts" ? "#003087" : "#f1f5f9",
                        color: historyTab === "contacts" ? "#ffffff" : "#475569",
                        border: "none",
                        borderRadius: "9999px",
                        padding: "0.3rem 0.75rem",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      Top Contacts & Orgs ({contactsSummaryList.length})
                    </button>
                  </div>

                  {historyTab === "movements" ? (
                    movements.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "1rem" }}>
                        No recent activity.
                      </p>
                    ) : (
                      <div className="activity-mini-list">
                        {movements.slice(0, 4).map((m) => (
                          <div
                            key={m.id}
                            className="activity-mini-row"
                            onClick={() => setSelectedContactForModal(m.counterparty)}
                            style={{ cursor: "pointer" }}
                            title={`Click to inspect payments to ${m.counterparty}`}
                          >
                            <div className="activity-mini-left">
                              <div className={`activity-type-symbol ${m.type}`}>
                                {m.type === "CART_PAYMENT" ? "🛒" : m.type === "SEND" ? "↗" : "↙"}
                              </div>
                              <div>
                                <p className="activity-mini-counterparty" style={{ color: "#0070ba", fontWeight: 700 }}>
                                  {m.counterparty}
                                </p>
                                <span className="activity-mini-tag">
                                  {m.tag ? m.tag.name : "Other"} •{" "}
                                  {new Date(m.createdAt).toLocaleDateString([], {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>
                            </div>

                            <div className="activity-mini-right">
                              <span
                                className={`activity-mini-amount ${
                                  m.direction === "OUTGOING" ? "outgoing" : "incoming"
                                }`}
                              >
                                {m.direction === "OUTGOING" ? "-" : "+"} {formatCurrency(m.amount)}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                <span className={`status-badge-mini ${m.status.toLowerCase()}`}>
                                  {m.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingReceiptMovement(m);
                                  }}
                                  title="View Official Digital Receipt"
                                  style={{
                                    background: "#eff6ff",
                                    border: "1px solid #bfdbfe",
                                    color: "#1d4ed8",
                                    borderRadius: "9999px",
                                    padding: "0.15rem 0.45rem",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Receipt
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    contactsSummaryList.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "1rem" }}>
                        No contacts found in ledger.
                      </p>
                    ) : (
                      <div>
                        {contactsSummaryList.slice(0, 4).map((c) => (
                          <div
                            key={c.counterparty}
                            className="contact-row-card"
                            onClick={() => setSelectedContactForModal(c.counterparty)}
                            title={`Click to view all payments to ${c.counterparty}`}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                              <div className={`contact-avatar ${c.isOrg ? "is-org" : ""}`}>
                                {c.isOrg ? "🏢" : c.counterparty.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h5 style={{ fontSize: "0.88rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                                  {c.counterparty}
                                </h5>
                                <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                                  {c.count} payment(s) • Last: {new Date(c.lastDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                                </span>
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ fontSize: "0.92rem", fontWeight: 800, color: "#0f172a", display: "block" }}>
                                ${c.totalSent > 0 ? c.totalSent.toFixed(2) : c.totalReceived.toFixed(2)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConsolidateContact(c.counterparty);
                                }}
                                style={{
                                  background: "#eff6ff",
                                  border: "1px solid #bfdbfe",
                                  color: "#1d4ed8",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  marginTop: "0.15rem",
                                }}
                              >
                                ✨ Consolidate
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW B: INSTAMART STORE & CART                       */}
        {/* ==================================================== */}
        {activeTab === "instamart" && (
          <div>
            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)" }}>
                Instamart Store
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Live product catalog powered by Channel3 • Instant checkout with dynamic tag budgets
              </p>
            </div>

            <div className="instamart-container">
              {/* Product Catalog Column */}
              <div>
                {/* Search Bar */}
                <div className="instamart-search-bar">
                  <input
                    type="text"
                    className="input-instamart"
                    placeholder="Search groceries, electronics, snacks, cables..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchProducts()}
                  />
                  <button
                    type="button"
                    className="btn-instamart-search"
                    onClick={() => searchProducts()}
                    disabled={searching}
                  >
                    {searching ? "Searching..." : "Search"}
                  </button>
                </div>

                {/* Category Quick Chips */}
                <div className="category-chips">
                  {["coffee", "snacks", "groceries", "headphones", "charger", "sensors"].map(
                    (chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="chip-btn"
                        onClick={() => {
                          setSearchQuery(chip);
                          searchProducts(chip);
                        }}
                      >
                        {chip.charAt(0).toUpperCase() + chip.slice(1)}
                      </button>
                    )
                  )}
                </div>

                {/* Product Cards Grid */}
                {searching ? (
                  <p style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                    Searching live products via Channel3 API...
                  </p>
                ) : products.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "3rem 1rem",
                      background: "#ffffff",
                      borderRadius: "16px",
                      border: "1px solid var(--card-border)",
                    }}
                  >
                    <p style={{ color: "var(--text-secondary)" }}>
                      Search for items above or click a category chip to load products.
                    </p>
                  </div>
                ) : (
                  <div className="product-catalog-grid">
                    {products.map((p) => (
                      <div key={p.id} className="product-catalog-card">
                        <div>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.title} className="product-img-box" />
                          ) : (
                            <div
                              className="product-img-box"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "var(--text-muted)",
                                fontSize: "0.8rem",
                              }}
                            >
                              No Image
                            </div>
                          )}
                          <h4 className="product-card-title">{p.title}</h4>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {p.domain}
                          </span>
                        </div>

                        <div style={{ marginTop: "0.75rem" }}>
                          <p className="product-card-price">{formatCurrency(p.cheapestPrice)}</p>
                          <button
                            type="button"
                            className="btn-add-instamart"
                            onClick={() => handleAddToCart(p)}
                          >
                            + Add to Cart
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Shopping Cart Drawer / Sidebar */}
              <div className="instamart-cart-sidebar">
                <h3 className="cart-sidebar-title">
                  My Cart ({cartItems.reduce((sum, i) => sum + i.quantity, 0)})
                </h3>

                {cartItems.length === 0 ? (
                  <p
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.85rem",
                      textAlign: "center",
                      padding: "2rem 0",
                    }}
                  >
                    Your cart is empty. Add products to begin.
                  </p>
                ) : (
                  <div>
                    <div className="cart-sidebar-items">
                      {cartItems.map((item) => (
                        <div key={item.id} className="cart-sidebar-row">
                          <div style={{ maxWidth: "160px" }}>
                            <p
                              style={{
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.title}
                            </p>
                            <span style={{ color: "#047857", fontWeight: 700 }}>
                              {formatCurrency(item.unitPrice)}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.id, -1)}
                              style={{
                                width: "22px",
                                height: "22px",
                                border: "1px solid #d1d5db",
                                background: "#fff",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              -
                            </button>
                            <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.id, 1)}
                              style={{
                                width: "22px",
                                height: "22px",
                                border: "1px solid #d1d5db",
                                background: "#fff",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveCartItem(item.id)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#ef4444",
                                cursor: "pointer",
                                marginLeft: "0.2rem",
                                fontWeight: 700,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="cart-sidebar-total-box">
                      <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>
                        Cart Total:
                      </span>
                      <span style={{ fontSize: "1.3rem", fontWeight: 900, color: "#003087" }}>
                        {formatCurrency(cartTotal)}
                      </span>
                    </div>

                    {/* Tag Selector & Quick Edit */}
                    <div style={{ marginBottom: "1rem" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.3rem",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            color: "var(--text-secondary)",
                          }}
                        >
                          Expense Category Tag:
                        </label>
                        {activeSelectedTag && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTagId(
                                editingTagId === activeSelectedTag.id ? null : activeSelectedTag.id
                              );
                              setEditTagName(activeSelectedTag.name);
                              setEditTagLimit(activeSelectedTag.monthlyLimit.toString());
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#0070ba",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {editingTagId === activeSelectedTag.id ? "Close Edit" : "✏️ Edit Limit"}
                          </button>
                        )}
                      </div>

                      <select
                        className="form-input-text"
                        style={{ width: "100%", padding: "0.55rem" }}
                        value={selectedTagId}
                        onChange={(e) => setSelectedTagId(e.target.value)}
                      >
                        {tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} (Limit: {formatCurrency(t.monthlyLimit)})
                          </option>
                        ))}
                      </select>

                      {/* Quick inline editor for chosen tag in cart */}
                      {activeSelectedTag && editingTagId === activeSelectedTag.id && (
                        <form
                          onSubmit={(e) => handleUpdateTag(e, activeSelectedTag.id)}
                          style={{
                            marginTop: "0.5rem",
                            padding: "0.6rem",
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            borderRadius: "8px",
                            display: "flex",
                            gap: "0.4rem",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#166534" }}>
                            Limit ({currencyRates[selectedCurrency]?.symbol || "$"}):
                          </span>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            className="form-input-text"
                            style={{ width: "85px", padding: "0.3rem 0.5rem", fontSize: "0.82rem" }}
                            value={editTagLimit}
                            onChange={(e) => setEditTagLimit(e.target.value)}
                            required
                          />
                          <button
                            type="submit"
                            disabled={savingTag}
                            className="btn-navy-pill"
                            style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
                          >
                            Save
                          </button>
                        </form>
                      )}
                    </div>

                    {/* Limit Impact Warning */}
                    {isOver100 && (
                      <div
                        style={{
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          color: "#b91c1c",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          fontSize: "0.78rem",
                          marginBottom: "1rem",
                        }}
                      >
                        🚨 <strong>Budget Exceeded:</strong> Cart will push {activeSelectedTag?.name}{" "}
                        to {formatCurrency(cartImpactProjected)} (limit:{" "}
                        {formatCurrency(activeSelectedTag?.monthlyLimit)})!
                      </div>
                    )}
                    {isOver80 && (
                      <div
                        style={{
                          background: "#fffbeb",
                          border: "1px solid #fde68a",
                          color: "#b45309",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "8px",
                          fontSize: "0.78rem",
                          marginBottom: "1rem",
                        }}
                      >
                        ⚠️ <strong>80% Limit Warning:</strong> Cart checkout will use{" "}
                        {(
                          (cartImpactProjected / (activeSelectedTag?.monthlyLimit || 1)) *
                          100
                        ).toFixed(1)}
                        % of {activeSelectedTag?.name} monthly budget.
                      </div>
                    )}

                    {/* Checkout Buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      {!loadingConfig && clientId ? (
                        <PayPalScriptProvider
                          options={{
                            clientId: clientId,
                            currency: "USD",
                            intent: "capture",
                          }}
                        >
                          <PayPalButtons
                            style={{
                              layout: "vertical",
                              color: "blue",
                              shape: "rect",
                              label: "pay",
                              height: 38,
                            }}
                            createOrder={async () => {
                              const res = await fetch("/api/orders", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ tagId: selectedTagId }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error);
                              return data.orderId;
                            }}
                            onApprove={async (data) => {
                              const res = await fetch(`/api/orders/${data.orderID}/capture`, {
                                method: "POST",
                              });
                              const captureData = await res.json();
                              if (captureData.success) {
                                setActionNotice({
                                  text: "Order captured & completed successfully via PayPal!",
                                  type: "success",
                                });
                                triggerPaymentSuccess({
                                  title: "PayPal Payment Completed",
                                  amount: cartTotal,
                                  recipient: "Instamart Store via PayPal",
                                  refId: data.orderID,
                                  note: `${cartItems.length} item(s) checked out`,
                                });
                                fetchCart();
                                fetchMovements();
                                fetchTags();
                              } else {
                                setActionNotice({
                                  text: captureData.error || "Capture failed",
                                  type: "error",
                                });
                              }
                            }}
                          />
                        </PayPalScriptProvider>
                      ) : (
                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          Loading PayPal buttons...
                        </p>
                      )}

                      <button
                        type="button"
                        className="btn-navy-pill"
                        style={{
                          background: "#ffffff",
                          color: "#003087",
                          border: "1.5px solid #003087",
                          fontSize: "0.85rem",
                          padding: "0.65rem",
                          justifyContent: "center",
                        }}
                        onClick={handleDevTestCheckout}
                      >
                        ⚡ Instant Dev Test Payment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW C: PAYMENT METHODS / BANKS AND CARDS            */}
        {/* ==================================================== */}
        {activeTab === "payment-methods" && (
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)" }}>
                Payment Methods & Bank Balances
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Connected bank accounts, credit cards, and sandbox balances
              </p>
            </div>

            <div className="section-card">
              <h3 className="section-card-title" style={{ marginBottom: "1rem" }}>
                Bank Accounts
              </h3>

              <div className="bank-cards-list">
                <div className="bank-card-row">
                  <div className="bank-card-left">
                    <div className="card-type-icon bank">BANK</div>
                    <div>
                      <p className="bank-card-title">Chase Premier Checking</p>
                      <span className="bank-card-sub">Routing: •••••0210 • Account •••• 9102</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p className="bank-card-balance">$4,320.50</p>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Available</span>
                  </div>
                </div>

                <div className="bank-card-row">
                  <div className="bank-card-left">
                    <div className="card-type-icon bank">BANK</div>
                    <div>
                      <p className="bank-card-title">Silicon Valley Bank Treasury</p>
                      <span className="bank-card-sub">Routing: •••••1210 • Account •••• 3341</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p className="bank-card-balance">$12,450.00</p>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Available</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="section-card">
              <h3 className="section-card-title" style={{ marginBottom: "1rem" }}>
                Cards
              </h3>

              <div className="bank-cards-list">
                <div className="bank-card-row">
                  <div className="bank-card-left">
                    <div className="card-type-icon visa">VISA</div>
                    <div>
                      <p className="bank-card-title">Visa Signature Credit Card</p>
                      <span className="bank-card-sub">Card ending in 4242 • Expires 08/2028</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 800, color: "#0070ba" }}>$8,750 Available</p>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>$10,000 Limit</span>
                  </div>
                </div>

                <div className="bank-card-row">
                  <div className="bank-card-left">
                    <div className="card-type-icon mastercard">MC</div>
                    <div>
                      <p className="bank-card-title">Mastercard Debit Card</p>
                      <span className="bank-card-sub">Card ending in 8821 • Expires 11/2027</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        background: "#ecfdf5",
                        color: "#047857",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "0.2rem 0.5rem",
                        borderRadius: "9999px",
                      }}
                    >
                      Active
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn-navy-pill"
                style={{
                  background: "#ffffff",
                  color: "#003087",
                  border: "1.5px solid #003087",
                  width: "100%",
                  justifyContent: "center",
                  marginTop: "1.25rem",
                }}
                onClick={() => {
                  setActionNotice({
                    text: "Sandbox card linker: Visa 4242 and Chase 9102 are already simulated and connected.",
                    type: "info",
                  });
                }}
              >
                + Link a new card or bank (Sandbox)
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW D: SEND & REQUEST HUB                           */}
        {/* ==================================================== */}
        {activeTab === "send-request" && (
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)" }}>
                Send and Request Money
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Direct disbursements via PayPal Payouts & Invoicing v2
              </p>
            </div>

            <div className="responsive-three-col-cards">
              <div className="section-card">
                <h3 className="section-card-title" style={{ marginBottom: "0.75rem" }}>
                  Send Money (Payouts)
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
                  Disburse money directly to any PayPal recipient email from your sandbox business account.
                </p>
                <button
                  type="button"
                  className="btn-navy-pill"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => {
                    setSendIsClub(false);
                    setShowSendModal(true);
                  }}
                >
                  Open Send Dialog
                </button>
              </div>

              <div className="section-card">
                <h3 className="section-card-title" style={{ marginBottom: "0.75rem" }}>
                  Request Money (Invoicing)
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
                  Send official invoices with a direct payer view link for dues or payments.
                </p>
                <button
                  type="button"
                  className="btn-navy-pill"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => {
                    setReqIsClub(false);
                    setShowRequestModal(true);
                  }}
                >
                  Open Request Dialog
                </button>
              </div>

              <div className="section-card" style={{ border: "1.5px solid #6366f1", background: "#f8fafc" }}>
                <h3 className="section-card-title" style={{ marginBottom: "0.75rem", color: "#4338ca" }}>
                  Split a Bill (Code Math)
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
                  Split an expense across members as Requests with penny reconciliation in code.
                </p>
                <button
                  type="button"
                  className="btn-navy-pill"
                  style={{ width: "100%", justifyContent: "center", background: "#4338ca", color: "#ffffff" }}
                  onClick={() => {
                    const el = document.getElementById("bill-split-hub");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  ➗ Split Expense Below
                </button>
              </div>
            </div>

            {/* Bill Splitting Hub Section */}
            <div id="bill-split-hub" className="section-card" style={{ marginTop: "1.75rem", border: "1.5px solid #e0e7ff" }}>
              <div className="section-card-header">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        background: "#e0e7ff",
                        color: "#4338ca",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                      }}
                    >
                      ➗ IN-CODE SPLIT MATH
                    </span>
                    <h3 className="section-card-title">Bill Splitting & Invoicing</h3>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    One amount split across selected members as Requests, with exact penny reconciliation computed in code
                  </p>
                </div>
              </div>

              {splitSuccessMsg && (
                <div
                  style={{
                    background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
                    border: "1px solid #10b981",
                    borderRadius: "10px",
                    padding: "0.85rem 1.15rem",
                    marginBottom: "1.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    color: "#065f46",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                  }}
                >
                  <span>{splitSuccessMsg}</span>
                  <button
                    type="button"
                    onClick={() => setSplitSuccessMsg(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46" }}
                  >
                    ✕
                  </button>
                </div>
              )}

              <form onSubmit={handleCreateSplit} className="split-bill-form-grid">
                {/* Form Controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="form-group-field">
                    <label className="form-field-label">
                      Expense / Bill Title
                    </label>
                    <input
                      type="text"
                      required
                      value={splitTitle}
                      onChange={(e) => setSplitTitle(e.target.value)}
                      className="form-input-text"
                      placeholder="e.g. Team Dinner, Circuit Boards, Uber"
                    />
                  </div>

                  <div className="form-group-field">
                    <label className="form-field-label">
                      Total Bill Amount ($ USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={splitTotal}
                      onChange={(e) => setSplitTotal(e.target.value)}
                      className="form-input-text"
                      placeholder="90.00"
                      style={{ fontSize: "1.1rem", fontWeight: 800 }}
                    />
                  </div>

                  {/* Include Creator Toggle */}
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                    <input
                      type="checkbox"
                      checked={splitIncludeCreator}
                      onChange={(e) => setSplitIncludeCreator(e.target.checked)}
                      style={{ width: "16px", height: "16px", accentColor: "#4338ca" }}
                    />
                    Include myself ({currentSessionEmail}) in the split
                  </label>

                  {/* Member Selection */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        Select Members to Bill
                      </label>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          onClick={() => {
                            const all = (activeClub?.members || [])
                              .map((m) => m.email)
                              .filter((e) => e.toLowerCase() !== currentSessionEmail.toLowerCase());
                            setSplitSelectedMembers(all);
                          }}
                          style={{ background: "none", border: "none", color: "#4338ca", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
                        >
                          Select All
                        </button>
                        <span style={{ color: "#cbd5e1" }}>|</span>
                        <button
                          type="button"
                          onClick={() => setSplitSelectedMembers([])}
                          style={{ background: "none", border: "none", color: "#64748b", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "140px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.6rem" }}>
                      {(activeClub?.members || [
                        { id: "1", name: "Jordan Lee (Member)", email: "jordan@roboticsclub.org" },
                        { id: "2", name: "Sam Taylor (Member)", email: "sam@roboticsclub.org" },
                        { id: "3", name: "Alex Vance (Treasurer)", email: "treasurer@roboticsclub.org" },
                      ])
                        .filter((m) => m.email.toLowerCase() !== currentSessionEmail.toLowerCase())
                        .map((member) => {
                          const isSelected = splitSelectedMembers.includes(member.email.toLowerCase());
                          return (
                            <label
                              key={member.email}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.35rem 0.5rem",
                                borderRadius: "6px",
                                background: isSelected ? "#eef2ff" : "transparent",
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                fontWeight: isSelected ? 700 : 500,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const email = member.email.toLowerCase();
                                  if (e.target.checked) {
                                    setSplitSelectedMembers([...splitSelectedMembers, email]);
                                  } else {
                                    setSplitSelectedMembers(splitSelectedMembers.filter((em) => em !== email));
                                  }
                                }}
                                style={{ accentColor: "#4338ca" }}
                              />
                              <span>{member.name}</span>
                              <span style={{ color: "#64748b", fontSize: "0.75rem", marginLeft: "auto" }}>
                                {member.email}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </div>

                {/* Live Split Math Preview Column */}
                <div
                  style={{
                    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1e293b", marginBottom: "0.5rem" }}>
                      🧮 Live Split Calculation
                    </h4>

                    {previewSplit ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#64748b" }}>
                          <span>Total Amount:</span>
                          <strong style={{ color: "#0f172a" }}>${previewSplit.totalAmount.toFixed(2)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#64748b" }}>
                          <span>Participants ({previewSplit.totalParticipants}):</span>
                          <span style={{ fontWeight: 600 }}>
                            {previewSplit.shares.some((s) => s.isCreator) ? "You + " : ""}
                            {previewSplit.requestsToIssue.length} member(s)
                          </span>
                        </div>

                        <div style={{ borderTop: "1px dashed #cbd5e1", margin: "0.4rem 0" }} />

                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {previewSplit.shares.map((share) => (
                            <div
                              key={share.email}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "0.8rem",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                background: share.isCreator ? "#e0e7ff" : "#ffffff",
                                color: share.isCreator ? "#3730a3" : "#334155",
                                fontWeight: share.isCreator ? 700 : 500,
                              }}
                            >
                              <span>
                                {share.isCreator ? "Your Share (Payer)" : share.email}
                              </span>
                              <strong>${share.amount.toFixed(2)}</strong>
                            </div>
                          ))}
                        </div>

                        <div
                          style={{
                            background: "#ecfdf5",
                            border: "1px solid #a7f3d0",
                            borderRadius: "6px",
                            padding: "0.4rem 0.6rem",
                            fontSize: "0.75rem",
                            color: "#065f46",
                            fontWeight: 600,
                            marginTop: "0.4rem",
                          }}
                        >
                          ✓ Exact Penny Reconciled: Sum equals exactly ${previewSplit.allocatedTotal.toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.8rem", color: "#64748b", fontStyle: "italic" }}>
                        Enter a valid bill amount and select members to see real-time split math.
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={creatingSplit || !previewSplit || previewSplit.requestsToIssue.length === 0}
                    className="btn-primary"
                    style={{
                      marginTop: "1rem",
                      width: "100%",
                      justifyContent: "center",
                      fontWeight: 800,
                      background: "linear-gradient(135deg, #4338ca 0%, #312e81 100%)",
                      color: "#ffffff",
                      padding: "0.85rem",
                      borderRadius: "12px",
                      fontSize: "0.95rem",
                    }}
                  >
                    {creatingSplit
                      ? "Issuing PayPal Invoices..."
                      : `➗ Send ${previewSplit ? previewSplit.requestsToIssue.length : 0} Split Request(s)`}
                  </button>
                </div>
              </form>

              {/* Active & Past Split Bills Feed */}
              {splits.length > 0 && (
                <div style={{ marginTop: "1.75rem", borderTop: "1px solid #e2e8f0", paddingTop: "1.25rem" }}>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1e293b", marginBottom: "0.75rem" }}>
                    Active & Recent Bill Splits ({splits.length})
                  </h4>

                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {splits.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "1rem",
                          background: "#ffffff",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>
                                {s.title}
                              </span>
                              <span
                                style={{
                                  background: s.isFullySettled ? "#ecfdf5" : "#fef3c7",
                                  color: s.isFullySettled ? "#059669" : "#d97706",
                                  padding: "0.15rem 0.5rem",
                                  borderRadius: "9999px",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                }}
                              >
                                {s.isFullySettled ? "✓ Fully Settled" : `${s.paidCount}/${s.requestsCount} Paid`}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.2rem" }}>
                              Total Bill: ${s.totalAmount.toFixed(2)} • Created by {s.creatorEmail} on {new Date(s.createdAt).toLocaleDateString()}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 800, fontSize: "1rem", color: "#4338ca" }}>
                                ${s.collected.toFixed(2)} / ${s.totalRequested.toFixed(2)}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                {s.progressPercent}% collected
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={deletingSplitId === s.id}
                              onClick={() => handleDeleteSplit(s.id, s.title)}
                              title="Delete this split bill record"
                              style={{
                                background: "#fef2f2",
                                color: "#b91c1c",
                                border: "1.5px solid #fecaca",
                                borderRadius: "8px",
                                padding: "0.35rem 0.65rem",
                                fontSize: "0.76rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <span>🗑️</span>
                              <span>{deletingSplitId === s.id ? "Deleting..." : "Delete"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "9999px", overflow: "hidden", marginBottom: "0.75rem" }}>
                          <div
                            style={{
                              width: `${s.progressPercent}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, #4338ca, #10b981)",
                              borderRadius: "9999px",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>

                        {/* Member Statuses */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {s.memberStatuses.map((st) => (
                            <div
                              key={st.movementId}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "0.4rem 0.6rem",
                                borderRadius: "6px",
                                background: "#f8fafc",
                                fontSize: "0.78rem",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: st.status === "COMPLETED" ? "#10b981" : "#f59e0b",
                                  }}
                                />
                                <span style={{ fontWeight: 600 }}>{st.memberEmail}</span>
                                <span style={{ color: "#64748b" }}>(${st.amount.toFixed(2)})</span>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                {st.invoiceUrl && (
                                  <a
                                    href={st.invoiceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: "#4338ca", textDecoration: "none", fontWeight: 700 }}
                                  >
                                    View Invoice ↗
                                  </a>
                                )}
                                {st.status === "COMPLETED" ? (
                                  <span style={{ color: "#059669", fontWeight: 700 }}>✓ Paid</span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={settlingMovementId === st.movementId}
                                    onClick={() => handleSettleSplitRequest(s.id, st.movementId)}
                                    style={{
                                      background: "#fef3c7",
                                      color: "#b45309",
                                      border: "1px solid #fde68a",
                                      padding: "0.2rem 0.5rem",
                                      borderRadius: "4px",
                                      fontWeight: 700,
                                      fontSize: "0.72rem",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {settlingMovementId === st.movementId ? "Settling..." : "Mark Paid (Demo)"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recipient Totals from the Unified Ledger */}
            <div className="section-card" style={{ marginTop: "1.75rem" }}>
              <div className="section-card-header">
                <div>
                  <h3 className="section-card-title">Recipient History & Totals</h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    All-time and this-month disbursement totals aggregated from the unified ledger
                  </p>
                </div>
              </div>

              {(() => {
                const now = new Date();
                const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

                const recipientMap = new Map<
                  string,
                  { allTime: number; thisMonth: number; count: number; lastDate: string }
                >();

                movements
                  .filter(
                    (m) =>
                      (m.type === "SEND" || m.type === "CLUB_PAYOUT") &&
                      m.direction === "OUTGOING" &&
                      m.status === "COMPLETED"
                  )
                  .forEach((m) => {
                    const email = m.counterparty.toLowerCase();
                    const existing = recipientMap.get(email) || {
                      allTime: 0,
                      thisMonth: 0,
                      count: 0,
                      lastDate: m.createdAt,
                    };
                    existing.allTime += m.amount;
                    if (new Date(m.createdAt) >= startOfMonth) {
                      existing.thisMonth += m.amount;
                    }
                    existing.count += 1;
                    recipientMap.set(email, existing);
                  });

                const recipientList = Array.from(recipientMap.entries());

                if (recipientList.length === 0) {
                  return (
                    <div
                      style={{
                        padding: "1.75rem",
                        textAlign: "center",
                        background: "#f8fafc",
                        borderRadius: "10px",
                        border: "1px dashed #cbd5e1",
                        color: "var(--text-muted)",
                        fontSize: "0.85rem",
                      }}
                    >
                      No completed disbursements to recipients recorded yet. Use &ldquo;Open Send Dialog&rdquo; above to send a payment.
                    </div>
                  );
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {recipientList.map(([email, stats]) => (
                      <div
                        key={email}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "0.85rem 1.1rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                        }}
                      >
                        <div>
                          <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-main)" }}>
                            {email}
                          </p>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {stats.count} transfer{stats.count > 1 ? "s" : ""} completed
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                          <div style={{ textAlign: "right" }}>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--text-secondary)",
                                textTransform: "uppercase",
                                fontWeight: 700,
                              }}
                            >
                              This Month
                            </span>
                            <p style={{ fontWeight: 800, color: "#0070ba", fontSize: "1.05rem" }}>
                              ${stats.thisMonth.toFixed(2)}
                            </p>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--text-secondary)",
                                textTransform: "uppercase",
                                fontWeight: 700,
                              }}
                            >
                              All-Time
                            </span>
                            <p style={{ fontWeight: 900, color: "var(--text-main)", fontSize: "1.05rem" }}>
                              ${stats.allTime.toFixed(2)}
                            </p>
                          </div>

                          <button
                            type="button"
                            className="btn-navy-pill"
                            style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                            onClick={() => {
                              setSendEmail(email);
                              setShowSendModal(true);
                            }}
                          >
                            Send Again
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW E: FULL ACTIVITY / UNIFIED LEDGER               */}
        {/* ==================================================== */}
        {activeTab === "activity" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)" }}>
                  Activity & Unified Ledger
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  Authoritative record of all money movements (Cart Payments, Sends, Requests)
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-navy-pill"
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1rem", background: "#059669", color: "#ffffff" }}
                  onClick={exportLedgerToCsv}
                  title="Export all ledger movements as a CSV file"
                >
                  📥 Export CSV
                </button>
                <button
                  type="button"
                  className="btn-navy-pill"
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
                  onClick={() => {
                    fetchMovements();
                    fetchTags();
                    fetchClubs();
                  }}
                >
                  ↻ Refresh All
                </button>
              </div>
            </div>

            {/* Sub-navigation & Search Header */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "0.4rem", overflowX: "auto", scrollbarWidth: "none" }}>
                <button
                  type="button"
                  onClick={() => setHistoryTab("movements")}
                  style={{
                    background: historyTab === "movements" ? "#003087" : "#ffffff",
                    color: historyTab === "movements" ? "#ffffff" : "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: "9999px",
                    padding: "0.45rem 1rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  All Movements ({movements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab("contacts")}
                  style={{
                    background: historyTab === "contacts" ? "#003087" : "#ffffff",
                    color: historyTab === "contacts" ? "#ffffff" : "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: "9999px",
                    padding: "0.45rem 1rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Contacts & Organizations ({contactsSummaryList.length})
                </button>
              </div>

              <div style={{ minWidth: "260px", maxWidth: "360px", flex: 1 }}>
                <input
                  type="text"
                  className="form-input-text"
                  placeholder="Search by name, email, tag, or note..."
                  value={contactsSearch}
                  onChange={(e) => setContactsSearch(e.target.value)}
                  style={{ fontSize: "0.82rem", padding: "0.45rem 0.85rem" }}
                />
              </div>
            </div>

            <div className="section-card">
              {historyTab === "movements" ? (
                (() => {
                  const filtered = movements.filter(
                    (m) =>
                      m.counterparty.toLowerCase().includes(contactsSearch.toLowerCase()) ||
                      (m.tag?.name && m.tag.name.toLowerCase().includes(contactsSearch.toLowerCase())) ||
                      (m.note && m.note.toLowerCase().includes(contactsSearch.toLowerCase()))
                  );
                  if (filtered.length === 0) {
                    return (
                      <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        {contactsSearch ? `No movements matching "${contactsSearch}".` : "No movements recorded yet."}
                      </p>
                    );
                  }
                  return (
                    <div className="activity-mini-list">
                      {filtered.map((m) => (
                        <div
                          key={m.id}
                          className="activity-mini-row"
                          style={{ padding: "1rem", borderRadius: "12px" }}
                        >
                          <div className="activity-mini-left" style={{ gap: "1rem" }}>
                            <div
                              className={`activity-type-symbol ${m.type}`}
                              style={{ width: "42px", height: "42px", fontSize: "1.1rem" }}
                            >
                              {m.type === "CART_PAYMENT" ? "🛒" : m.type === "SEND" ? "↗" : "↙"}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => setSelectedContactForModal(m.counterparty)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  fontSize: "1rem",
                                  fontWeight: 800,
                                  color: "#0070ba",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  textDecoration: "underline",
                                  textUnderlineOffset: "3px",
                                }}
                                title={`Click to view all payments to ${m.counterparty}`}
                              >
                                {m.counterparty}
                              </button>
                              {m.items && m.items.length > 0 && (
                                <p
                                  style={{
                                    fontSize: "0.76rem",
                                    color: "var(--text-muted)",
                                    marginTop: "0.15rem",
                                  }}
                                >
                                  🛒 {m.items.map((it) => `${it.title} ×${it.quantity}`).join(", ")}
                                </p>
                              )}
                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  color: "var(--text-secondary)",
                                  display: "flex",
                                  gap: "0.5rem",
                                  marginTop: "0.2rem",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    background: "#f1f5f9",
                                    padding: "0.15rem 0.45rem",
                                    borderRadius: "4px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {m.tag ? m.tag.name : "Other"}
                                </span>
                                <span>•</span>
                                <span>{new Date(m.createdAt).toLocaleString()}</span>
                                {m.club && (
                                  <>
                                    <span>•</span>
                                    <span style={{ color: "#7c3aed", fontWeight: 600 }}>
                                      {m.club.name}
                                    </span>
                                  </>
                                )}
                                {m.note && (
                                  <>
                                    <span>•</span>
                                    <span style={{ fontStyle: "italic", color: "#64748b" }}>&ldquo;{m.note}&rdquo;</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="activity-mini-right">
                            <span
                              className={`activity-mini-amount ${
                                m.direction === "OUTGOING" ? "outgoing" : "incoming"
                              }`}
                              style={{ fontSize: "1.15rem" }}
                            >
                              {m.direction === "OUTGOING" ? "-" : "+"} {formatCurrency(m.amount)}
                            </span>

                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                              <span className={`status-badge-mini ${m.status.toLowerCase()}`}>
                                {m.status}
                              </span>

                              <button
                                type="button"
                                onClick={() => setViewingReceiptMovement(m)}
                                title="View Official PayPal Sandbox Digital Receipt"
                                style={{
                                  background: "#eff6ff",
                                  border: "1px solid #bfdbfe",
                                  color: "#1d4ed8",
                                  borderRadius: "9999px",
                                  padding: "0.2rem 0.55rem",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                }}
                              >
                                🧾 Receipt
                              </button>

                              {m.invoiceUrl && (
                                <a
                                  href={m.invoiceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#0070ba",
                                    textDecoration: "none",
                                    fontWeight: 700,
                                  }}
                                >
                                  View Invoice ↗
                                </a>
                              )}

                              {m.type === "REQUEST" && m.status === "PENDING" && (
                                <button
                                  type="button"
                                  onClick={() => handleSimulatePaid(m.id)}
                                  style={{
                                    background: "#ecfdf5",
                                    border: "1px solid #a7f3d0",
                                    color: "#047857",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Mark Paid
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRefreshMovement(m.id)}
                                style={{
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  color: "var(--text-secondary)",
                                  fontSize: "0.72rem",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                Sync
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : (
                (() => {
                  const filteredContacts = contactsSummaryList.filter((c) =>
                    c.counterparty.toLowerCase().includes(contactsSearch.toLowerCase())
                  );
                  if (filteredContacts.length === 0) {
                    return (
                      <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        {contactsSearch ? `No contacts matching "${contactsSearch}".` : "No contacts in ledger yet."}
                      </p>
                    );
                  }
                  return (
                    <div className="contacts-cards-grid">
                      {filteredContacts.map((c) => (
                        <div
                          key={c.counterparty}
                          className="contact-row-card"
                          onClick={() => setSelectedContactForModal(c.counterparty)}
                          style={{
                            flexDirection: "column",
                            alignItems: "stretch",
                            padding: "1.1rem",
                            borderRadius: "14px",
                            cursor: "pointer",
                            gap: "0.85rem",
                          }}
                          title={`Click to open full payment ledger for ${c.counterparty}`}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                              <div
                                className={`contact-avatar ${c.isOrg ? "is-org" : ""}`}
                                style={{ width: "42px", height: "42px", fontSize: "1.1rem" }}
                              >
                                {c.isOrg ? "🏢" : c.counterparty.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                                  {c.counterparty}
                                </h4>
                                <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                                  {c.isOrg ? "Organization / Club / Vendor" : "Individual Member"}
                                </span>
                              </div>
                            </div>
                            <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                              ${c.totalSent > 0 ? c.totalSent.toFixed(2) : c.totalReceived.toFixed(2)}
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "0.78rem",
                              color: "#475569",
                              borderTop: "1px solid #f1f5f9",
                              paddingTop: "0.5rem",
                            }}
                          >
                            <span>{c.count} movement(s) recorded</span>
                            <span>Last: {new Date(c.lastDate).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                          </div>

                          {c.tags.size > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                              {Array.from(c.tags).slice(0, 3).map((tg) => (
                                <span
                                  key={tg}
                                  style={{
                                    fontSize: "0.7rem",
                                    background: "#f1f5f9",
                                    color: "#475569",
                                    padding: "0.15rem 0.45rem",
                                    borderRadius: "4px",
                                    fontWeight: 600,
                                  }}
                                >
                                  🏷️ {tg}
                                </span>
                              ))}
                            </div>
                          )}

                          <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.2rem" }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConsolidateContact(c.counterparty);
                              }}
                              className="btn-navy-pill"
                              style={{
                                flex: 1,
                                justifyContent: "center",
                                fontSize: "0.76rem",
                                padding: "0.35rem 0.6rem",
                              }}
                            >
                              ✨ Consolidate
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedContactForModal(c.counterparty);
                              }}
                              style={{
                                flex: 1,
                                justifyContent: "center",
                                fontSize: "0.76rem",
                                padding: "0.35rem 0.6rem",
                                background: "#eff6ff",
                                border: "1px solid #bfdbfe",
                                color: "#1d4ed8",
                                borderRadius: "9999px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              🔍 View History
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW F: CLUBS & TREASURY HUB (Step 5)                */}
        {/* ==================================================== */}
        {activeTab === "club" && activeClub && (
          <div>
            {/* Club Header Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
                borderRadius: "16px",
                padding: "1.75rem",
                color: "#ffffff",
                marginBottom: "1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Enterprise Treasury
                  </span>
                  <span
                    style={{
                      background: role === "TREASURER" ? "#10b981" : "#f59e0b",
                      color: "#ffffff",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {role === "TREASURER" ? "Treasurer Session" : "Member Session"}
                  </span>
                </div>

                <h2 style={{ fontSize: "1.85rem", fontWeight: 900, marginTop: "0.4rem" }}>
                  {activeClub.name} Treasury
                </h2>
                <p style={{ opacity: 0.9, fontSize: "0.88rem", marginTop: "0.2rem", maxWidth: "600px" }}>
                  {activeClub.description || "Autonomous multi-entity treasury, receivables & operational disbursements"}
                </p>

                {/* Club Dropdown Selector & Add New Club Button */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.85rem", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Switch Entity:
                    </span>
                    <select
                      className="club-scroll-select-dark"
                      value={activeClub?.id || ""}
                      onChange={(e) => handleSelectClub(e.target.value)}
                      style={{
                        background: "rgba(255, 255, 255, 0.18)",
                        border: "1px solid rgba(255, 255, 255, 0.35)",
                        color: "#ffffff",
                        padding: "0.35rem 0.9rem",
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        backdropFilter: "blur(6px)",
                      }}
                      title="Select or switch organization"
                    >
                      {clubs.map((c) => (
                        <option key={c.id} value={c.id} style={{ color: "#0f172a", background: "#ffffff" }}>
                          🏢 {c.name} — {formatCurrency(c.balance)} ({c.members?.length || 0} members)
                        </option>
                      ))}
                      <option value="__ADD_NEW__" style={{ color: "#4f46e5", fontWeight: "bold", background: "#f5f3ff" }}>
                        ➕ + Add New Organization...
                      </option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddClubModal(true)}
                    style={{
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "9999px",
                      padding: "0.35rem 0.9rem",
                      fontSize: "0.82rem",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                    }}
                  >
                    <span>+</span> Add Organization
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.12)",
                  backdropFilter: "blur(8px)",
                  padding: "1rem 1.5rem",
                  borderRadius: "12px",
                  textAlign: "right",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.8,
                  }}
                >
                  Vault Balance (Ledger-Computed)
                </span>
                <p style={{ fontSize: "1.85rem", fontWeight: 900, marginTop: "0.15rem" }}>
                  {formatCurrency(activeClub.balance)}
                </p>
                <span style={{ fontSize: "0.72rem", opacity: 0.8 }}>
                  +{activeClub.members.length} Active Members
                </span>
              </div>
            </div>

            {/* Club Sub-Tab Navigation Bar */}
            <div
              className="club-subnav-strip"
              style={{
                display: "flex",
                gap: "0.5rem",
                borderBottom: "1.5px solid #e2e8f0",
                marginBottom: "1.5rem",
                overflowX: "auto",
                whiteSpace: "nowrap",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
              }}
            >
              {[
                { id: "overview", label: "Overview", icon: "📊" },
                { id: "fundraiser", label: `Capital Projects (${events.length})`, icon: "🎯" },
                { id: "dues", label: `Retainers & Invoices (${duesCycles.length})`, icon: "📩" },
                { id: "requests", label: `Expense Claims (${claims.length})`, icon: "🧾" },
                { id: "ledger", label: "Shared Ledger & Audit", icon: "📖" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="club-subtab-btn"
                  onClick={() => {
                    setClubSubTab(tab.id as any);
                    refreshActiveClubData();
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    borderBottom: clubSubTab === tab.id ? "3px solid #4338ca" : "3px solid transparent",
                    padding: "0.75rem 1.15rem",
                    fontSize: "0.92rem",
                    fontWeight: clubSubTab === tab.id ? 800 : 600,
                    color: clubSubTab === tab.id ? "#4338ca" : "var(--text-secondary)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{tab.icon}</span>
                  <span style={{ whiteSpace: "nowrap", display: "inline-block", wordBreak: "keep-all" }}>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* ==================================================== */}
            {/* SUBTAB 1: OVERVIEW                                   */}
            {/* ==================================================== */}
            {clubSubTab === "overview" && (
              <div className="club-overview-main-grid">
                <div>
                  {/* Ledger Breakdown Card */}
                  <div className="section-card" style={{ marginBottom: "1.5rem" }}>
                    <h3 className="section-card-title">Treasury Balance Calculation</h3>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                      Authoritatively derived in code from completed unified ledger transactions
                    </p>

                    <div className="three-col-stats-grid">
                      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "1rem", borderRadius: "10px" }}>
                        <span style={{ fontSize: "0.72rem", color: "#166534", textTransform: "uppercase", fontWeight: 700 }}>
                          Total Collected
                        </span>
                        <p style={{ fontSize: "1.4rem", fontWeight: 900, color: "#15803d", marginTop: "0.2rem" }}>
                          +{formatCurrency(movements
                            .filter((m) => m.clubId === activeClub.id && m.direction === "INCOMING" && m.status === "COMPLETED")
                            .reduce((sum, m) => sum + m.amount, 0))}
                        </p>
                        <span style={{ fontSize: "0.72rem", color: "#166534" }}>Dues & donations</span>
                      </div>

                      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "1rem", borderRadius: "10px" }}>
                        <span style={{ fontSize: "0.72rem", color: "#991b1b", textTransform: "uppercase", fontWeight: 700 }}>
                          Total Disbursed
                        </span>
                        <p style={{ fontSize: "1.4rem", fontWeight: 900, color: "#b91c1c", marginTop: "0.2rem" }}>
                          -{formatCurrency(movements
                            .filter((m) => m.clubId === activeClub.id && m.direction === "OUTGOING" && m.status === "COMPLETED")
                            .reduce((sum, m) => sum + m.amount, 0))}
                        </p>
                        <span style={{ fontSize: "0.72rem", color: "#991b1b" }}>Reimbursements & payouts</span>
                      </div>

                      <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", padding: "1rem", borderRadius: "10px" }}>
                        <span style={{ fontSize: "0.72rem", color: "#3730a3", textTransform: "uppercase", fontWeight: 700 }}>
                          Net Vault Balance
                        </span>
                        <p style={{ fontSize: "1.4rem", fontWeight: 900, color: "#4338ca", marginTop: "0.2rem" }}>
                          {formatCurrency(activeClub.balance)}
                        </p>
                        <span style={{ fontSize: "0.72rem", color: "#3730a3" }}>Available in vault</span>
                      </div>
                    </div>
                  </div>

                  {/* STEP 7: CLUB AI TREASURY INSIGHTS & COPILOT */}
                  <div
                    style={{
                      background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
                      border: "1.5px solid #c7d2fe",
                      borderRadius: "14px",
                      padding: "1.25rem",
                      marginBottom: "1.5rem",
                      boxShadow: "0 4px 14px rgba(99, 102, 241, 0.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1.2rem" }}>🤖</span>
                        <h4 style={{ fontSize: "1.02rem", fontWeight: 800, color: "#1e1b4b", margin: 0 }}>
                          Club Treasury Copilot
                        </h4>
                      </div>
                      <span style={{ fontSize: "0.72rem", background: "#ffffff", padding: "0.2rem 0.5rem", borderRadius: "9999px", color: "#4338ca", fontWeight: 700, border: "1px solid #c7d2fe" }}>
                        Ledger Reasoning Engine
                      </span>
                    </div>

                    <p style={{ fontSize: "0.82rem", color: "#475569", marginBottom: "0.85rem" }}>
                      Ask Gemini to synthesize the club&apos;s unified ledger, analyze cash flows, and spot anomalies in real time:
                      Ask Gemini to synthesize the club&apos;s unified ledger, analyze cash flows, consolidate payments, and spot anomalies in real time:
                    </p>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleRunAiCommand();
                      }}
                      style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem" }}
                    >
                      <input
                        type="text"
                        className="form-input-text"
                        placeholder={`Ask Copilot about ${activeClub.name} (e.g. 'consolidate payments for Jordan', 'summarize dues')...`}
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        style={{ fontSize: "0.85rem", padding: "0.5rem 0.85rem", background: "#ffffff" }}
                      />
                      <button
                        type="submit"
                        className="btn-navy-pill"
                        disabled={aiLoading || !aiQuery.trim()}
                        style={{ fontSize: "0.82rem", padding: "0.5rem 1rem", minWidth: "90px", justifyContent: "center" }}
                      >
                        {aiLoading ? "..." : "Ask Copilot"}
                      </button>
                    </form>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                      <button
                        type="button"
                        onClick={() => {
                          const query = `where did our money go? Summarize all outgoing disbursements and major expenses for ${activeClub.name}.`;
                          setAiQuery(query);
                          handleRunAiCommand(query);
                        }}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          padding: "0.45rem 0.85rem",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          color: "#1e293b",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                      >
                        <span>🔍</span>
                        <span>Where did our money go?</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const query = `give a monthly treasury summary for ${activeClub.name}: vault balance, dues collection rate, and open claims.`;
                          setAiQuery(query);
                          handleRunAiCommand(query);
                        }}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          padding: "0.45rem 0.85rem",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          color: "#1e293b",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                      >
                        <span>📈</span>
                        <span>Monthly Treasury Summary</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const query = `check ${activeClub.name} for any anomalies, spikes, duplicate claims, or limit breaches.`;
                          setAiQuery(query);
                          handleRunAiCommand(query);
                        }}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          padding: "0.45rem 0.85rem",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          color: "#1e293b",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                      >
                        <span>⚠️</span>
                        <span>Check Anomalies & Spikes</span>
                      </button>
                    </div>

                    {/* In-Club Output Display */}
                    {aiLoading && (
                      <div
                        style={{
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "10px",
                          padding: "1.25rem",
                          fontSize: "0.85rem",
                          lineHeight: "1.6",
                          color: "#4f46e5",
                          maxHeight: "260px",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                        }}
                      >
                        <span
                          className="spinner-border"
                          style={{
                            width: "20px",
                            height: "20px",
                            border: "2.5px solid #4f46e5",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            display: "inline-block",
                            animation: "spin 0.8s linear infinite",
                          }}
                        />
                        <span style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                          Analyzing club ledger movements & computing live treasury figures...
                        </span>
                      </div>
                    )}

                    {aiResponse && !aiLoading && (
                      <div
                        style={{
                          background: "#ffffff",
                          border: "1.5px solid #c7d2fe",
                          borderRadius: "12px",
                          padding: "1.25rem",
                          boxShadow: "0 4px 12px rgba(99, 102, 241, 0.08)",
                          maxHeight: "360px",
                          overflowY: "auto",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.75rem",
                            borderBottom: "1px solid #f1f5f9",
                            paddingBottom: "0.5rem",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                            <span style={{ fontWeight: 800, color: "#4338ca", fontSize: "0.82rem", textTransform: "uppercase" }}>
                              ✨ Copilot Analysis Result
                            </span>
                            <span style={{ fontSize: "0.72rem", background: "#ecfdf5", color: "#065f46", padding: "0.1rem 0.45rem", borderRadius: "4px", fontWeight: 700 }}>
                              Real-Time Ledger Verified
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => setCopilotOpen(true)}
                              style={{
                                background: "#f1f5f9",
                                border: "1px solid #cbd5e1",
                                color: "#475569",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                padding: "0.2rem 0.55rem",
                                borderRadius: "6px",
                                cursor: "pointer",
                              }}
                            >
                              Open in Panel ➔
                            </button>
                            <button
                              type="button"
                              onClick={() => setAiResponse(null)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#94a3b8",
                                cursor: "pointer",
                                fontSize: "0.95rem",
                                padding: "0.2rem 0.4rem",
                              }}
                              title="Dismiss"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {renderFormattedCopilotText(aiResponse.text)}
                      </div>
                    )}
                  </div>

                  {/* Club Tag Limits */}
                  <div className="section-card">
                    <h3 className="section-card-title">Club Expense Categories & Limits</h3>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                      Per-club spending limits enforced on reimbursements and disbursements
                    </p>

                    {tags.filter((t) => !t.clubId || t.clubId === activeClub.id).length === 0 ? (
                      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No tags configured for this club.</p>
                    ) : (
                      <div className="tag-bars-list">
                        {tags
                          .filter((t) => !t.clubId || t.clubId === activeClub.id)
                          .map((t) => (
                            <div key={t.id} className="tag-bar-item">
                              <div className="tag-bar-header">
                                <span className="tag-name-bold">{t.name}</span>
                                <span className="tag-numbers-text">
                                  {formatCurrency(t.spent)} / {formatCurrency(t.monthlyLimit)}
                                </span>
                              </div>
                              <div className="tag-track-bg">
                                <div
                                  className={`tag-fill-bar ${
                                    t.percentageUsed >= 100
                                      ? "exceeded"
                                      : t.percentageUsed >= 80
                                      ? "warning"
                                      : "normal"
                                  }`}
                                  style={{ width: `${Math.min(100, t.percentageUsed)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Members & Quick Navigation */}
                <div>
                  <div className="section-card" style={{ marginBottom: "1.5rem" }}>
                    <h3 className="section-card-title">Team Roster ({activeClub.members.length})</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                      {activeClub.members.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "0.6rem 0.8rem",
                            background: "#f8fafc",
                            borderRadius: "8px",
                            border: "1px solid #eef2f6",
                          }}
                        >
                          <div>
                            <p style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-main)" }}>
                              {m.name}
                            </p>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {m.email}
                            </span>
                          </div>
                          <span
                            style={{
                              background: m.role === "TREASURER" ? "#e0e7ff" : "#f1f5f9",
                              color: m.role === "TREASURER" ? "#4338ca" : "var(--text-secondary)",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.2rem 0.55rem",
                              borderRadius: "9999px",
                            }}
                          >
                            {m.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="section-card">
                    <h3 className="section-card-title">Quick Actions</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
                      <button
                        type="button"
                        className="btn-navy-pill"
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={() => setClubSubTab("dues")}
                      >
                        📩 Issue or View Retainer Invoices
                      </button>
                      <button
                        type="button"
                        className="btn-navy-pill"
                        style={{
                          background: "#ffffff",
                          color: "#4338ca",
                          border: "1.5px solid #4338ca",
                          width: "100%",
                          justifyContent: "center",
                        }}
                        onClick={() => setClubSubTab("requests")}
                      >
                        🧾 Submit or Review Expense Claims
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        style={{
                          background: "#e0e7ff",
                          color: "#3730a3",
                          border: "1.5px solid #6366f1",
                          width: "100%",
                          justifyContent: "center",
                          fontWeight: 700,
                        }}
                        onClick={() => setClubSubTab("fundraiser")}
                      >
                        🎯 View Capital Projects & Progress
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================================================== */}
            {/* SUBTAB: EVENT FUNDRAISER (GOAL & PROGRESS BAR)      */}
            {/* ==================================================== */}
            {clubSubTab === "fundraiser" && (
              <div>
                {/* Notification Banner */}
                {donationSuccessMsg && (
                  <div
                    style={{
                      background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
                      border: "1px solid #10b981",
                      borderRadius: "12px",
                      padding: "1rem 1.25rem",
                      marginBottom: "1.5rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "#065f46",
                      fontWeight: 600,
                    }}
                  >
                    <span>{donationSuccessMsg}</span>
                    <button
                      type="button"
                      onClick={() => setDonationSuccessMsg(null)}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: "1.1rem",
                        cursor: "pointer",
                        color: "#065f46",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Active Campaign Selection / Overview Header */}
                {events.length === 0 ? (
                  <div className="section-card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🎯</div>
                    <h3 style={{ fontSize: "1.3rem", fontWeight: 800 }}>No Active Capital Projects Yet</h3>
                    <p style={{ color: "var(--text-secondary)", marginTop: "0.4rem" }}>
                      Launch a capital project to collect funding directly via PayPal Orders v2 into the unified treasury ledger.
                    </p>
                  </div>
                ) : (
                  (() => {
                    const activeEvent =
                      events.find((e) => e.id === selectedEventId) || events[0];
                    return (
                      <div>
                        {/* Event Selector Pill Group (if multiple) */}
                        {events.length > 1 && (
                          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", overflowX: "auto" }}>
                            {events.map((ev) => (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => setSelectedEventId(ev.id)}
                                style={{
                                  padding: "0.5rem 1rem",
                                  borderRadius: "9999px",
                                  border: selectedEventId === ev.id ? "2px solid #4338ca" : "1px solid #cbd5e1",
                                  background: selectedEventId === ev.id ? "#e0e7ff" : "#ffffff",
                                  color: selectedEventId === ev.id ? "#312e81" : "#475569",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  fontSize: "0.85rem",
                                }}
                              >
                                {ev.title} ({ev.progressPercent}%)
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Main Fundraiser Showcase Card with Progress Bar */}
                        <div
                          className="section-card"
                          style={{
                            marginBottom: "1.5rem",
                            background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                            border: "1.5px solid #e2e8f0",
                            boxShadow: "0 8px 24px -4px rgba(67, 56, 202, 0.08)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                                <span
                                  style={{
                                    background: "#e0e7ff",
                                    color: "#4338ca",
                                    padding: "0.2rem 0.65rem",
                                    borderRadius: "9999px",
                                    fontSize: "0.75rem",
                                    fontWeight: 800,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}
                                >
                                  🎯 Capital Project / Initiative
                                </span>
                                <span
                                  style={{
                                    background: "#f1f5f9",
                                    color: "#475569",
                                    padding: "0.2rem 0.65rem",
                                    borderRadius: "9999px",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  Tag: {activeEvent.tagName}
                                </span>
                                {activeEvent.isGoalReached && (
                                  <span
                                    style={{
                                      background: "#ecfdf5",
                                      color: "#059669",
                                      padding: "0.2rem 0.65rem",
                                      borderRadius: "9999px",
                                      fontSize: "0.75rem",
                                      fontWeight: 800,
                                    }}
                                  >
                                    🎉 Goal Achieved!
                                  </span>
                                )}
                              </div>
                              <h2 style={{ fontSize: "1.6rem", fontWeight: 900, color: "#0f172a" }}>
                                {activeEvent.title}
                              </h2>
                              <p style={{ color: "#475569", fontSize: "0.92rem", marginTop: "0.3rem", maxWidth: "680px" }}>
                                {activeEvent.description || "Support this organizational team initiative through the shared treasury ledger."}
                              </p>
                            </div>

                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "2rem", fontWeight: 900, color: "#4338ca" }}>
                                {formatCurrency(activeEvent.totalCollected)}
                              </div>
                              <div style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>
                                raised of {formatCurrency(activeEvent.goalAmount)} goal
                              </div>
                            </div>
                          </div>

                          {/* Dynamic Progress Bar */}
                          <div style={{ marginTop: "1.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>
                              <span style={{ color: "#4338ca" }}>{activeEvent.progressPercent}% Funded</span>
                              <span style={{ color: activeEvent.remaining > 0 ? "#64748b" : "#059669" }}>
                                {activeEvent.remaining > 0
                                  ? `${formatCurrency(activeEvent.remaining)} remaining to goal`
                                  : "Goal 100% completed!"}
                              </span>
                            </div>

                            <div
                              style={{
                                width: "100%",
                                height: "20px",
                                background: "#e2e8f0",
                                borderRadius: "9999px",
                                overflow: "hidden",
                                position: "relative",
                                boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.1)",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, activeEvent.progressPercent)}%`,
                                  height: "100%",
                                  background: "linear-gradient(90deg, #4338ca 0%, #06b6d4 100%)",
                                  borderRadius: "9999px",
                                  transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                                  boxShadow: "0 0 12px rgba(67, 56, 202, 0.4)",
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: "0.5rem",
                                fontSize: "0.75rem",
                                color: "#94a3b8",
                                fontWeight: 600,
                              }}
                            >
                              <span>{formatCurrency(0)}</span>
                              <span>Target: {formatCurrency(activeEvent.goalAmount)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Two Columns: Contribute Action & Recent Donors */}
                        <div className="event-contribute-grid">
                          {/* Left Column: Contribution via PayPal Order */}
                          <div className="section-card">
                            <div className="section-card-header">
                              <div>
                                <h3 className="section-card-title">Contribute with PayPal Order</h3>
                                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                                  Creates and captures a real PayPal Order v2 tagged to {activeEvent.title}
                                </p>
                              </div>
                              <span
                                style={{
                                  background: "#e0e7ff",
                                  color: "#4338ca",
                                  fontSize: "0.75rem",
                                  fontWeight: 800,
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "6px",
                                }}
                              >
                                Orders v2
                              </span>
                            </div>

                            <form onSubmit={handleDonateToEvent} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                              {/* Quick Preset Buttons */}
                              <div>
                                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                                  Quick Select Amount
                                </label>
                                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                  {["10.00", "25.00", "50.00", "100.00"].map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() => setEventDonationAmount(preset)}
                                      style={{
                                        padding: "0.45rem 1rem",
                                        borderRadius: "8px",
                                        border: eventDonationAmount === preset ? "2px solid #4338ca" : "1px solid #cbd5e1",
                                        background: eventDonationAmount === preset ? "#e0e7ff" : "#ffffff",
                                        color: eventDonationAmount === preset ? "#312e81" : "#475569",
                                        fontWeight: 800,
                                        fontSize: "0.9rem",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                      }}
                                    >
                                      {formatCurrency(preset)}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="form-group-field">
                                <label className="form-field-label">
                                  Contribution Amount ({currencyRates[selectedCurrency]?.label || "$ USD"})
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="1"
                                  required
                                  value={eventDonationAmount}
                                  onChange={(e) => setEventDonationAmount(e.target.value)}
                                  className="form-input-text"
                                  placeholder="25.00"
                                  style={{ fontWeight: 800, fontSize: "1.1rem" }}
                                />
                              </div>

                              <div className="responsive-two-col-inputs">
                                <div className="form-group-field">
                                  <label className="form-field-label">
                                    Your Name / Sponsor
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={eventDonorName}
                                    onChange={(e) => setEventDonorName(e.target.value)}
                                    className="form-input-text"
                                    placeholder="Alex Vance"
                                  />
                                </div>
                                <div className="form-group-field">
                                  <label className="form-field-label">
                                    Your Email
                                  </label>
                                  <input
                                    type="email"
                                    required
                                    value={eventDonorEmail}
                                    onChange={(e) => setEventDonorEmail(e.target.value)}
                                    className="form-input-text"
                                    placeholder="donor@example.com"
                                  />
                                </div>
                              </div>

                              <div
                                style={{
                                  background: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                  padding: "0.75rem",
                                  fontSize: "0.8rem",
                                  color: "#64748b",
                                }}
                              >
                                💡 <strong>How it works:</strong> Creates an official PayPal Order v2, records PENDING in unified ledger, then captures authoritatively. Funds credit to <strong>{activeClub.name}</strong> vault immediately.
                              </div>

                              <button
                                type="submit"
                                disabled={donatingToEvent}
                                className="btn-primary"
                                style={{
                                  padding: "0.85rem",
                                  fontWeight: 800,
                                  fontSize: "0.95rem",
                                  background: "linear-gradient(135deg, #4338ca 0%, #3730a3 100%)",
                                  color: "#ffffff",
                                  borderRadius: "12px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "0.5rem",
                                }}
                              >
                                {donatingToEvent
                                  ? "Processing PayPal Order..."
                                  : `🚀 Contribute ${formatCurrency(eventDonationAmount || "0")} with PayPal Order`}
                              </button>
                            </form>
                          </div>

                          {/* Right Column: Recent Contributors Feed */}
                          <div className="section-card">
                            <div className="section-card-header">
                              <div>
                                <h3 className="section-card-title">Contributors & Donors ({activeEvent.donorCount})</h3>
                                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                                  Verified incoming movements from the unified ledger
                                </p>
                              </div>
                            </div>

                            {activeEvent.recentDonors.length === 0 ? (
                              <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                                <p style={{ fontSize: "0.9rem" }}>No contributions yet.</p>
                                <p style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
                                  Be the first supporter for this campaign!
                                </p>
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                {activeEvent.recentDonors.map((donor) => (
                                  <div
                                    key={donor.id}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      padding: "0.75rem",
                                      borderRadius: "8px",
                                      background: "#f8fafc",
                                      border: "1px solid #e2e8f0",
                                    }}
                                  >
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>
                                        {donor.contributor}
                                      </div>
                                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem" }}>
                                        {new Date(donor.date).toLocaleDateString()} at {new Date(donor.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                      <span
                                        style={{
                                          fontWeight: 800,
                                          fontSize: "0.95rem",
                                          color: "#059669",
                                          background: "#ecfdf5",
                                          padding: "0.25rem 0.6rem",
                                          borderRadius: "6px",
                                        }}
                                      >
                                        +{formatCurrency(donor.amount)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* Treasurer Form: Launch New Fundraiser */}
                {role === "TREASURER" && (
                  <div className="section-card" style={{ marginTop: "1.5rem" }}>
                    <div className="section-card-header">
                      <div>
                        <h3 className="section-card-title">Launch Capital Project / Initiative</h3>
                        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          Finance Controller authority: Establish funding targets and track project contributions
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleCreateEvent} className="event-launch-form-grid" style={{ alignItems: "flex-end" }}>
                      <div className="form-group-field">
                        <label className="form-field-label">
                          Campaign Title
                        </label>
                        <input
                          type="text"
                          required
                          value={newEventTitle}
                          onChange={(e) => setNewEventTitle(e.target.value)}
                          className="form-input-text"
                          placeholder="e.g. Tokyo Robotics Finals 2026"
                        />
                      </div>
                      <div className="form-group-field">
                        <label className="form-field-label">
                          Description
                        </label>
                        <input
                          type="text"
                          value={newEventDesc}
                          onChange={(e) => setNewEventDesc(e.target.value)}
                          className="form-input-text"
                          placeholder="Goal details..."
                        />
                      </div>
                      <div className="form-group-field">
                        <label className="form-field-label">
                          Goal Amount ({currencyRates[selectedCurrency]?.symbol || "$"})
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="10"
                          required
                          value={newEventGoal}
                          onChange={(e) => setNewEventGoal(e.target.value)}
                          className="form-input-text"
                          placeholder="1200.00"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={creatingEvent}
                        className="btn-primary"
                        style={{
                          height: "44px",
                          padding: "0 1.35rem",
                          whiteSpace: "nowrap",
                          color: "#ffffff",
                          borderRadius: "12px",
                          fontWeight: 800,
                        }}
                      >
                        {creatingEvent ? "Launching..." : "🚀 Launch Campaign"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* ==================================================== */}
            {/* SUBTAB 2: DUES                                       */}
            {/* ==================================================== */}
            {clubSubTab === "dues" && (
              <div>
                {/* Treasurer Create Dues Cycle Card */}
                {role === "TREASURER" ? (
                  <div className="section-card" style={{ marginBottom: "1.5rem" }}>
                    <div className="section-card-header">
                      <div>
                        <h3 className="section-card-title">Issue Corporate Retainers & Assessments</h3>
                        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          Finance Controller authority: Issues PayPal Invoicing v2 requests to all entity partners
                        </p>
                      </div>
                      <span
                        style={{
                          background: "#e0e7ff",
                          color: "#4338ca",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "0.25rem 0.65rem",
                          borderRadius: "9999px",
                        }}
                      >
                        Treasurer Authorized
                      </span>
                    </div>

                    <form onSubmit={handleCreateDuesCycle} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ flex: 2, minWidth: "200px" }}>
                        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                          Cycle Title:
                        </label>
                        <input
                          type="text"
                          className="form-input-text"
                          value={newDuesTitle}
                          onChange={(e) => setNewDuesTitle(e.target.value)}
                          placeholder="e.g. Winter 2026 Season Dues"
                          required
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: "120px" }}>
                        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                          Amount Per Member ({currencyRates[selectedCurrency]?.symbol || "$"}):
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          className="form-input-text"
                          value={newDuesAmount}
                          onChange={(e) => setNewDuesAmount(e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: "140px" }}>
                        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                          Due Date:
                        </label>
                        <input
                          type="date"
                          className="form-input-text"
                          value={newDuesDueDate}
                          onChange={(e) => setNewDuesDueDate(e.target.value)}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={creatingDues}
                        className="btn-navy-pill"
                        style={{ padding: "0.65rem 1.4rem", fontSize: "0.88rem" }}
                      >
                        {creatingDues ? "Invoicing Members..." : "Issue Invoices to All Members"}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div
                    style={{
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      color: "#92400e",
                      padding: "0.85rem 1.25rem",
                      borderRadius: "10px",
                      fontSize: "0.85rem",
                      marginBottom: "1.5rem",
                    }}
                  >
                    ℹ️ <strong>Member View:</strong> Dues cycles are created by the club Treasurer. Below you can check your payment status and view your invoice link.
                  </div>
                )}

                {/* Dues Cycles & In-Code Computed Status */}
                {duesCycles.length === 0 ? (
                  <div
                    style={{
                      padding: "3rem",
                      textAlign: "center",
                      background: "#ffffff",
                      borderRadius: "12px",
                      border: "1px dashed #cbd5e1",
                      color: "var(--text-muted)",
                    }}
                  >
                    No dues cycles created yet. {role === "TREASURER" ? "Use the form above to issue team dues." : "Check back once the Treasurer sets the cycle."}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    {duesCycles.map((cycle) => (
                      <div key={cycle.id} className="section-card">
                        <div className="section-card-header">
                          <div>
                            <h3 className="section-card-title">{cycle.title}</h3>
                            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                              {formatCurrency(cycle.amount)} / member • Due by:{" "}
                              <strong>{new Date(cycle.dueDate).toLocaleDateString()}</strong>
                              {cycle.isPastDueDate && (
                                <span style={{ color: "#b91c1c", fontWeight: 700, marginLeft: "0.5rem" }}>
                                  (Past Due)
                                </span>
                              )}
                            </p>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                              Collection Progress
                            </span>
                            <p style={{ fontWeight: 800, color: "#166534", fontSize: "1.1rem" }}>
                              {formatCurrency(cycle.totalCollected)} / {formatCurrency(cycle.totalExpected)}
                            </p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ background: "#e2e8f0", height: "8px", borderRadius: "9999px", overflow: "hidden", marginBottom: "1.25rem" }}>
                          <div
                            style={{
                              background: cycle.progressPercent >= 100 ? "#10b981" : "#4338ca",
                              width: `${Math.min(100, cycle.progressPercent)}%`,
                              height: "100%",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>

                        {/* Member Status Table (Computed in CODE from ledger) */}
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                            <thead>
                              <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                                <th style={{ padding: "0.6rem 0.8rem", color: "var(--text-secondary)" }}>Member</th>
                                <th style={{ padding: "0.6rem 0.8rem", color: "var(--text-secondary)" }}>Role</th>
                                <th style={{ padding: "0.6rem 0.8rem", color: "var(--text-secondary)" }}>Amount</th>
                                <th style={{ padding: "0.6rem 0.8rem", color: "var(--text-secondary)" }}>Status (Code-Computed)</th>
                                <th style={{ padding: "0.6rem 0.8rem", color: "var(--text-secondary)", textAlign: "right" }}>Action / Link</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cycle.memberStatuses.map((st) => (
                                <tr key={st.memberId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <td style={{ padding: "0.65rem 0.8rem", fontWeight: 700, color: "var(--text-main)" }}>
                                    {st.memberName}
                                    <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400 }}>
                                      {st.memberEmail}
                                    </span>
                                  </td>
                                  <td style={{ padding: "0.65rem 0.8rem" }}>
                                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: st.role === "TREASURER" ? "#4338ca" : "var(--text-muted)" }}>
                                      {st.role}
                                    </span>
                                  </td>
                                  <td style={{ padding: "0.65rem 0.8rem", fontWeight: 800 }}>
                                    {formatCurrency(st.amount)}
                                  </td>
                                  <td style={{ padding: "0.65rem 0.8rem" }}>
                                    <span
                                      style={{
                                        display: "inline-block",
                                        padding: "0.2rem 0.6rem",
                                        borderRadius: "9999px",
                                        fontSize: "0.72rem",
                                        fontWeight: 800,
                                        background:
                                          st.status === "PAID"
                                            ? "#dcfce7"
                                            : st.status === "OVERDUE"
                                            ? "#fee2e2"
                                            : "#fef3c7",
                                        color:
                                          st.status === "PAID"
                                            ? "#15803d"
                                            : st.status === "OVERDUE"
                                            ? "#b91c1c"
                                            : "#b45309",
                                      }}
                                    >
                                      {st.status}
                                    </span>
                                  </td>
                                  <td style={{ padding: "0.65rem 0.8rem", textAlign: "right" }}>
                                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", alignItems: "center" }}>
                                      {st.invoiceUrl && (
                                        <a
                                          href={st.invoiceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{ fontSize: "0.75rem", color: "#0070ba", fontWeight: 700, textDecoration: "none" }}
                                        >
                                          View Invoice ↗
                                        </a>
                                      )}
                                      {st.status !== "PAID" && st.movementId && (
                                        <button
                                          type="button"
                                          onClick={() => handleSimulatePaid(st.movementId!)}
                                          style={{
                                            background: "#ecfdf5",
                                            border: "1px solid #a7f3d0",
                                            color: "#047857",
                                            fontSize: "0.72rem",
                                            fontWeight: 700,
                                            padding: "0.2rem 0.5rem",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                          }}
                                        >
                                          Mark Paid
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ==================================================== */}
            {/* SUBTAB 3: REQUESTS (REIMBURSEMENT CLAIMS)            */}
            {/* ==================================================== */}
            {clubSubTab === "requests" && (
              <div className="club-claims-grid">
                {/* Submit Claim Card */}
                <div className="section-card">
                  <h3 className="section-card-title">Submit Corporate Expense Claim</h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                    Team members & officers can submit out-of-pocket receipts for corporate review
                  </p>

                  <form onSubmit={handleSubmitClaim} className="modal-form-stack">
                    <div className="form-group-field">
                      <label className="form-field-label">Claimant Name & Email:</label>
                      <input
                        type="text"
                        className="form-input-text"
                        value={`${currentSessionName} (${currentSessionEmail})`}
                        disabled
                        style={{ background: "#f8fafc", color: "var(--text-secondary)" }}
                      />
                    </div>

                    <div className="form-group-field">
                      <label className="form-field-label">Amount (USD):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.50"
                        className="form-input-text"
                        value={claimAmount}
                        onChange={(e) => setClaimAmount(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group-field">
                      <label className="form-field-label">Category Tag:</label>
                      <select
                        className="form-input-text"
                        value={claimTagId}
                        onChange={(e) => setClaimTagId(e.target.value)}
                      >
                        {tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} (Limit: {formatCurrency(t.monthlyLimit)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group-field">
                      <label className="form-field-label">Purpose / Receipt Note:</label>
                      <textarea
                        className="form-input-text"
                        rows={3}
                        value={claimNote}
                        onChange={(e) => setClaimNote(e.target.value)}
                        placeholder="e.g. Ultrasonic distance sensors from Adafruit for regional autonomous contest"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingClaim}
                      className="btn-navy-pill"
                      style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem" }}
                    >
                      {submittingClaim ? "Submitting..." : "Submit Claim for Review"}
                    </button>
                  </form>
                </div>

                {/* Review Queue */}
                <div className="section-card">
                  <div className="section-card-header">
                    <div>
                      <h3 className="section-card-title">Claims Review Queue ({claims.length})</h3>
                      <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        Approved and Paid are separate states • Exactly-once payout guarantee
                      </p>
                    </div>
                  </div>

                  {claims.length === 0 ? (
                    <div
                      style={{
                        padding: "2.5rem",
                        textAlign: "center",
                        background: "#f8fafc",
                        borderRadius: "10px",
                        border: "1px dashed #cbd5e1",
                        color: "var(--text-muted)",
                        fontSize: "0.85rem",
                      }}
                    >
                      No reimbursement claims submitted yet. Use the form on the left to submit an expense.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                      {claims.map((cl) => {
                        const isSelfClaim = cl.requesterEmail.toLowerCase() === currentSessionEmail.toLowerCase();

                        return (
                          <div
                            key={cl.id}
                            style={{
                              background: "#ffffff",
                              border: "1px solid #e2e8f0",
                              borderRadius: "10px",
                              padding: "1rem",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span style={{ fontWeight: 800, color: "var(--text-main)", fontSize: "0.95rem" }}>
                                    {cl.requesterName}
                                  </span>
                                  {isSelfClaim && (
                                    <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "0.68rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "4px" }}>
                                      You
                                    </span>
                                  )}
                                  {cl.flaggedSelfApproved && (
                                    <span style={{ background: "#fee2e2", color: "#b91c1c", fontSize: "0.68rem", fontWeight: 800, padding: "0.15rem 0.45rem", borderRadius: "4px" }}>
                                      ⚠️ Self-Approved by Treasurer
                                    </span>
                                  )}
                                </div>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                  {cl.requesterEmail} • {new Date(cl.createdAt).toLocaleDateString()}
                                </span>
                              </div>

                              <div style={{ textAlign: "right" }}>
                                <span style={{ fontSize: "1.15rem", fontWeight: 900, color: "var(--text-main)" }}>
                                  {formatCurrency(cl.amount)}
                                </span>
                                <div>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "0.15rem 0.55rem",
                                      borderRadius: "9999px",
                                      fontSize: "0.7rem",
                                      fontWeight: 800,
                                      background:
                                        cl.status === "PAID"
                                          ? "#dcfce7"
                                          : cl.status === "APPROVED"
                                          ? "#dbeafe"
                                          : cl.status === "REJECTED"
                                          ? "#fee2e2"
                                          : "#fef3c7",
                                      color:
                                        cl.status === "PAID"
                                          ? "#15803d"
                                          : cl.status === "APPROVED"
                                          ? "#1d4ed8"
                                          : cl.status === "REJECTED"
                                          ? "#b91c1c"
                                          : "#b45309",
                                    }}
                                  >
                                    {cl.status}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", marginTop: "0.4rem", lineHeight: "1.4" }}>
                              &ldquo;{cl.note}&rdquo;
                            </p>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid #f1f5f9" }}>
                              <span style={{ fontSize: "0.74rem", background: "#f1f5f9", padding: "0.15rem 0.45rem", borderRadius: "4px", color: "var(--text-secondary)" }}>
                                Tag: {cl.tag?.name || "General"}
                              </span>

                              {/* Treasurer review actions */}
                              {role === "TREASURER" && cl.status === "SUBMITTED" && (
                                <div style={{ display: "flex", gap: "0.4rem" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveClaim(cl)}
                                    style={{
                                      background: "#10b981",
                                      color: "#ffffff",
                                      border: "none",
                                      fontSize: "0.78rem",
                                      fontWeight: 700,
                                      padding: "0.35rem 0.75rem",
                                      borderRadius: "6px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    ✓ Approve & Disburse
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectClaim(cl.id)}
                                    style={{
                                      background: "#fef2f2",
                                      color: "#b91c1c",
                                      border: "1px solid #fecaca",
                                      fontSize: "0.78rem",
                                      fontWeight: 700,
                                      padding: "0.35rem 0.65rem",
                                      borderRadius: "6px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    ✕ Decline
                                  </button>
                                </div>
                              )}

                              {cl.status === "PAID" && (
                                <span style={{ fontSize: "0.74rem", color: "#15803d", fontWeight: 700 }}>
                                  ✓ Disbursed via PayPal Payouts
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================================================== */}
            {/* SUBTAB 4: SHARED LEDGER & AUDIT TRAIL                */}
            {/* ==================================================== */}
            {clubSubTab === "ledger" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* Shared Club Ledger */}
                <div className="section-card">
                  <div className="section-card-header">
                    <div>
                      <h3 className="section-card-title">Shared Club Ledger</h3>
                      <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        Transparent, immutable financial movements belonging to {activeClub.name}
                      </p>
                    </div>
                  </div>

                  {movements.filter((m) => m.clubId === activeClub.id).length === 0 ? (
                    <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                      No club transactions recorded in the ledger yet.
                    </p>
                  ) : (
                    <div className="activity-mini-list">
                      {movements
                        .filter((m) => m.clubId === activeClub.id)
                        .map((m) => (
                          <div key={m.id} className="activity-mini-row" style={{ padding: "0.85rem 1rem" }}>
                            <div className="activity-mini-left">
                              <div className={`activity-type-symbol ${m.type}`}>
                                {m.type === "CLUB_DUES" ? "📥" : "📤"}
                              </div>
                              <div>
                                <p style={{ fontWeight: 800, fontSize: "0.92rem", color: "var(--text-main)" }}>
                                  {m.counterparty}
                                </p>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", gap: "0.4rem", marginTop: "0.15rem" }}>
                                  <span>{m.note || m.type}</span>
                                  <span>•</span>
                                  <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="activity-mini-right">
                              <span className={`activity-mini-amount ${m.direction === "OUTGOING" ? "outgoing" : "incoming"}`}>
                                {m.direction === "OUTGOING" ? "-" : "+"} {formatCurrency(m.amount)}
                              </span>
                              <span className={`status-badge-mini ${m.status.toLowerCase()}`}>
                                {m.status}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Append-Only Audit Trail */}
                <div className="section-card">
                  <div className="section-card-header">
                    <div>
                      <h3 className="section-card-title">🔒 Append-Only Audit Trail</h3>
                      <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        Permanent record of all treasury actions (timestamp, user, role, and action)
                      </p>
                    </div>
                    <span
                      style={{
                        background: "#f1f5f9",
                        color: "var(--text-secondary)",
                        fontSize: "0.72rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        fontWeight: 700,
                      }}
                    >
                      Immutable
                    </span>
                  </div>

                  {clubAuditLogs.length === 0 ? (
                    <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                      No audit events recorded yet.
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                            <th style={{ padding: "0.65rem 0.85rem", color: "var(--text-secondary)" }}>Time</th>
                            <th style={{ padding: "0.65rem 0.85rem", color: "var(--text-secondary)" }}>User / Authorized By</th>
                            <th style={{ padding: "0.65rem 0.85rem", color: "var(--text-secondary)" }}>Role</th>
                            <th style={{ padding: "0.65rem 0.85rem", color: "var(--text-secondary)" }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clubAuditLogs.map((log) => (
                            <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "0.65rem 0.85rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                {new Date(log.createdAt).toLocaleString()}
                              </td>
                              <td style={{ padding: "0.65rem 0.85rem", fontWeight: 700, color: "var(--text-main)" }}>
                                {log.who}
                              </td>
                              <td style={{ padding: "0.65rem 0.85rem" }}>
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 800,
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "9999px",
                                    background: log.role === "TREASURER" ? "#e0e7ff" : "#f1f5f9",
                                    color: log.role === "TREASURER" ? "#4338ca" : "var(--text-secondary)",
                                  }}
                                >
                                  {log.role}
                                </span>
                              </td>
                              <td style={{ padding: "0.65rem 0.85rem", fontWeight: 700, color: log.action.includes("SELF") ? "#b91c1c" : "#1e1b4b" }}>
                                {log.action}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* VIEW G: DEDICATED PROFILE & INSTANT SCAN-TO-PAY TAB  */}
        {/* ==================================================== */}
        {activeTab === "profile" && (
          <div style={{ maxWidth: "860px", margin: "0 auto" }}>
            {/* Header Banner */}
            <div className="profile-header-banner">
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div
                  style={{
                    width: "58px",
                    height: "58px",
                    borderRadius: "50%",
                    background: "#ffffff",
                    color: "#003087",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.45rem",
                    fontWeight: 900,
                    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
                  }}
                >
                  {role === "TREASURER" ? "AR" : "JL"}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <h2 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 900 }}>
                      {currentSessionName}
                    </h2>
                    <span
                      style={{
                        background: role === "TREASURER" ? "#10b981" : "#38bdf8",
                        color: role === "TREASURER" ? "#ffffff" : "#002266",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        padding: "0.2rem 0.6rem",
                        borderRadius: "9999px",
                        textTransform: "uppercase",
                      }}
                    >
                      {role}
                    </span>
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.88rem", opacity: 0.9 }}>
                    {currentSessionEmail} • Verified PayPal Sandbox Account
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setQrSeed(Date.now());
                    setActionNotice({ text: "🔄 QR Code refreshed with fresh token seed!", type: "info" });
                  }}
                  style={{
                    background: "rgba(255, 255, 255, 0.2)",
                    border: "1px solid rgba(255, 255, 255, 0.35)",
                    color: "#ffffff",
                    borderRadius: "9999px",
                    padding: "0.45rem 1rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <span>🔄</span> Refresh QR
                </button>
              </div>
            </div>

            {/* Main Profile Grid */}
            <div className="profile-grid">
              {/* Left Column: Live QR Code Card */}
              <div className="section-card" style={{ textAlign: "center", padding: "1.75rem 1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div style={{ textAlign: "left" }}>
                    <h3 className="section-card-title" style={{ margin: 0 }}>
                      Live Scan-to-Pay QR
                    </h3>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0.15rem 0 0" }}>
                      Instant camera scan to send funds directly
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQrSeed(Date.now());
                      setActionNotice({ text: "🔄 Fresh QR code generated!", type: "info" });
                    }}
                    title="Generate new QR token"
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      padding: "0.3rem 0.65rem",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      color: "#0f172a",
                    }}
                  >
                    🔄 Refresh
                  </button>
                </div>

                {/* QR Code Container */}
                <div
                  style={{
                    background: "linear-gradient(135deg, #003087 0%, #0070ba 100%)",
                    borderRadius: "18px",
                    padding: "1.15rem",
                    display: "inline-block",
                    boxShadow: "0 8px 24px rgba(0, 48, 135, 0.22)",
                    marginBottom: "1rem",
                    maxWidth: "100%",
                  }}
                >
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "0.85rem",
                      borderRadius: "14px",
                      display: "inline-block",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
                      maxWidth: "100%",
                    }}
                  >
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(
                        typeof window !== "undefined"
                          ? `${window.location.origin}/?tab=send-request&recipient=${encodeURIComponent(currentSessionEmail)}${
                              qrAmount ? `&amount=${encodeURIComponent(qrAmount)}` : ""
                            }${qrNote ? `&note=${encodeURIComponent(qrNote)}` : ""}&t=${qrSeed}`
                          : `https://paypal.me/${currentSessionEmail.split("@")[0]}`
                      )}`}
                      alt="PayPal Scan-to-Pay QR Code"
                      style={{ width: "180px", height: "180px", maxWidth: "100%", display: "block", margin: "0 auto" }}
                    />
                  </div>
                  <div style={{ color: "#ffffff", marginTop: "0.85rem", fontSize: "0.82rem", fontWeight: 700 }}>
                    {qrAmount ? (
                      <span>Requesting {formatCurrency(qrAmount)}</span>
                    ) : (
                      <span>Open Amount • Scan to Pay</span>
                    )}
                  </div>
                </div>

                {/* Action Links */}
                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const payUrl =
                        typeof window !== "undefined"
                          ? `${window.location.origin}/?tab=send-request&recipient=${encodeURIComponent(currentSessionEmail)}${
                              qrAmount ? `&amount=${encodeURIComponent(qrAmount)}` : ""
                            }${qrNote ? `&note=${encodeURIComponent(qrNote)}` : ""}&t=${qrSeed}`
                          : "";
                      if (payUrl && navigator.clipboard) {
                        navigator.clipboard.writeText(payUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      }
                      setActionNotice({
                        text: `📋 Copied direct payment link for ${currentSessionEmail}!`,
                        type: "success",
                      });
                    }}
                    className="btn-navy-pill"
                    style={{
                      flex: 1,
                      minWidth: "130px",
                      justifyContent: "center",
                      background: copiedLink ? "#ecfdf5" : "#ffffff",
                      color: copiedLink ? "#065f46" : "#003087",
                      border: copiedLink ? "1.5px solid #10b981" : "1.5px solid #003087",
                      fontSize: "0.82rem",
                      padding: "0.65rem 0.5rem",
                      borderRadius: "10px",
                    }}
                  >
                    {copiedLink ? "✓ Link Copied!" : "🔗 Copy Direct Link"}
                  </button>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setSendEmail(currentSessionEmail);
                      if (qrAmount) setSendAmount(qrAmount);
                      if (qrNote) setSendNote(qrNote);
                      setShowSendModal(true);
                    }}
                    style={{
                      flex: 1,
                      minWidth: "130px",
                      justifyContent: "center",
                      fontSize: "0.82rem",
                      padding: "0.65rem 0.5rem",
                      borderRadius: "10px",
                      color: "#ffffff",
                    }}
                  >
                    💸 Test Pay Self
                  </button>
                </div>
              </div>

              {/* Right Column: QR Code Customizer & Profile Settings */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* Customize QR Request */}
                <div className="section-card">
                  <h3 className="section-card-title" style={{ marginBottom: "0.4rem" }}>
                    Configure QR Payment
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                    Set a pre-filled amount and payment note into the live QR code
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    <div className="form-group-field">
                      <label className="form-field-label">
                        Requested Amount ({currencyRates[selectedCurrency]?.label || "$ USD"}):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        placeholder="Leave empty for open amount"
                        value={qrAmount}
                        onChange={(e) => setQrAmount(e.target.value)}
                        className="form-input-text"
                        style={{ fontSize: "0.95rem", fontWeight: 700 }}
                      />
                    </div>

                    <div className="form-group-field">
                      <label className="form-field-label">
                        Payment Purpose / Note:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Lunch split or team dues"
                        value={qrNote}
                        onChange={(e) => setQrNote(e.target.value)}
                        className="form-input-text"
                      />
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
                      {["10.00", "25.00", "50.00", "100.00"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setQrAmount(preset)}
                          style={{
                            padding: "0.35rem 0.75rem",
                            borderRadius: "6px",
                            border: qrAmount === preset ? "2px solid #003087" : "1px solid #cbd5e1",
                            background: qrAmount === preset ? "#e0f2fe" : "#ffffff",
                            color: qrAmount === preset ? "#003087" : "#475569",
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            cursor: "pointer",
                          }}
                        >
                          {formatCurrency(preset)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setQrAmount("")}
                        style={{
                          padding: "0.35rem 0.75rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#64748b",
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
                      >
                        Clear Amount
                      </button>
                    </div>
                  </div>
                </div>

                {/* Account Details & Role Card */}
                <div className="section-card">
                  <h3 className="section-card-title" style={{ marginBottom: "0.4rem" }}>
                    Account Details
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", fontSize: "0.85rem", marginTop: "0.6rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
                      <span style={{ color: "#64748b" }}>Display Name:</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>{currentSessionName}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
                      <span style={{ color: "#64748b" }}>Email:</span>
                      <span style={{ fontWeight: 700, color: "#0070ba" }}>{currentSessionEmail}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
                      <span style={{ color: "#64748b" }}>Active Role:</span>
                      <span style={{ fontWeight: 800, color: role === "TREASURER" ? "#10b981" : "#0284c7" }}>
                        {role === "TREASURER" ? "Finance Controller (Authorized)" : "Team Contributor"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Current Entity:</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>
                        {activeClub ? activeClub.name : "Apex Robotics Dynamics Treasury"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================== */}
      {/* MODAL 0: TREASURER SELF-APPROVAL CERTIFICATION MODAL */}
      {/* ==================================================== */}
      {claimToApprove && (
        <div className="modal-overlay" onClick={() => setClaimToApprove(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-sheet-title">⚠️ Treasurer Self-Reimbursement</h3>
              <button type="button" className="btn-close-modal" onClick={() => setClaimToApprove(null)}>
                ✕
              </button>
            </div>

            <div
              style={{
                padding: "0.9rem",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "10px",
                marginBottom: "1rem",
              }}
            >
              <p style={{ fontSize: "0.85rem", color: "#92400e", fontWeight: 800 }}>
                Conflict-of-Interest Safeguard:
              </p>
              <p style={{ fontSize: "0.82rem", color: "#b45309", marginTop: "0.25rem", lineHeight: "1.4" }}>
                You are approving a reimbursement claim submitted by yourself (<strong>{claimToApprove.requesterEmail}</strong>) for <strong>{formatCurrency(claimToApprove.amount)}</strong>.
              </p>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  fontSize: "0.84rem",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  lineHeight: "1.4",
                }}
              >
                <input
                  type="checkbox"
                  checked={selfCertified}
                  onChange={(e) => setSelfCertified(e.target.checked)}
                  style={{ marginTop: "0.2rem" }}
                />
                <span>
                  <strong>I certify under club honor code</strong> that this expense ({formatCurrency(claimToApprove.amount)} - &ldquo;{claimToApprove.note}&rdquo;) is legitimate, verified by receipt, and solely for club operations. This approval will be logged as an immutable high-priority event in the club audit trail.
                </span>
              </label>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-navy-pill"
                style={{ background: "#f1f5f9", color: "var(--text-secondary)", border: "1px solid #cbd5e1" }}
                onClick={() => setClaimToApprove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selfCertified || approvingClaim}
                className="btn-navy-pill"
                style={{ opacity: selfCertified ? 1 : 0.4 }}
                onClick={() => handleApproveClaim(claimToApprove, true)}
              >
                {approvingClaim ? "Disbursing..." : "Confirm & Disburse Payout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 1: SEND PAYMENTS (PayPal Payouts v1)            */}
      {/* ==================================================== */}
      {showSendModal && (
        <div className="modal-overlay" onClick={() => setShowSendModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-sheet-title">
                {sendIsClub ? "Club Reimbursement" : "Send Money"}
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowSendModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendMoney} className="modal-form-stack">
              <div className="form-group-field">
                <label className="form-field-label">Recipient Email:</label>
                <input
                  type="email"
                  className="form-input-text"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  required
                />
                {recipientSummary && (
                  <div
                    style={{
                      marginTop: "0.45rem",
                      padding: "0.5rem 0.75rem",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      color: "#166534",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.3rem",
                    }}
                  >
                    <span>
                      📊 <strong>Ledger History:</strong> All-Time:{" "}
                      <strong>${recipientSummary.allTimeTotal.toFixed(2)}</strong>
                    </span>
                    <span>
                      This Month: <strong>${recipientSummary.thisMonthTotal.toFixed(2)}</strong>{" "}
                      ({recipientSummary.count} txns)
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group-field">
                <label className="form-field-label">Amount (USD):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input-text"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group-field">
                <label className="form-field-label">Expense Tag (Required):</label>
                <select
                  className="form-input-text"
                  value={sendTagId}
                  onChange={(e) => setSendTagId(e.target.value)}
                  required
                >
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Limit: ${t.monthlyLimit.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group-field">
                <label className="form-field-label">Note / Purpose:</label>
                <input
                  type="text"
                  className="form-input-text"
                  value={sendNote}
                  onChange={(e) => setSendNote(e.target.value)}
                  placeholder="Reimbursement or direct transfer"
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="sendClubToggle"
                  checked={sendIsClub}
                  onChange={(e) => setSendIsClub(e.target.checked)}
                />
                <label
                  htmlFor="sendClubToggle"
                  style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
                >
                  Disburse from Club Treasury (Treasurer check enforced)
                </label>
              </div>

              <button
                type="submit"
                className="btn-navy-pill"
                style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem" }}
              >
                Confirm & Disburse via Payouts
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 2: REQUEST PAYMENTS (PayPal Invoicing v2)       */}
      {/* ==================================================== */}
      {showRequestModal && (
        <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-sheet-title">
                {reqIsClub ? "Request Club Dues" : "Request Money"}
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowRequestModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRequestMoney} className="modal-form-stack">
              <div className="form-group-field">
                <label className="form-field-label">Payer Email:</label>
                <input
                  type="email"
                  className="form-input-text"
                  value={reqEmail}
                  onChange={(e) => setReqEmail(e.target.value)}
                  placeholder="member@example.com"
                  required
                />
              </div>

              <div className="form-group-field">
                <label className="form-field-label">Payer Name:</label>
                <input
                  type="text"
                  className="form-input-text"
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  placeholder="Jordan Lee"
                  required
                />
              </div>

              <div className="form-group-field">
                <label className="form-field-label">Amount (USD):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input-text"
                  value={reqAmount}
                  onChange={(e) => setReqAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group-field">
                <label className="form-field-label">Expense Tag (Required):</label>
                <select
                  className="form-input-text"
                  value={reqTagId}
                  onChange={(e) => setReqTagId(e.target.value)}
                  required
                >
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group-field">
                <label className="form-field-label">Invoice Note / Description:</label>
                <input
                  type="text"
                  className="form-input-text"
                  value={reqNote}
                  onChange={(e) => setReqNote(e.target.value)}
                  placeholder="Monthly club membership dues"
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="reqClubToggle"
                  checked={reqIsClub}
                  onChange={(e) => setReqIsClub(e.target.checked)}
                />
                <label
                  htmlFor="reqClubToggle"
                  style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
                >
                  Deposit into Club Treasury when paid
                </label>
              </div>

              <button
                type="submit"
                className="btn-navy-pill"
                style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem" }}
              >
                Send Invoice via Invoicing v2
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADD NEW CLUB & INITIALIZE TREASURY VAULT      */}
      {/* ==================================================== */}
      {showAddClubModal && (
        <div className="modal-overlay" onClick={() => setShowAddClubModal(false)}>
          <div
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "560px", width: "95%" }}
          >
            <div className="modal-header-row">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "1.5rem" }}>🏢</span>
                <div>
                  <h3 className="modal-sheet-title" style={{ margin: 0 }}>Create New Organization / Entity</h3>
                  <p style={{ fontSize: "0.82rem", color: "#64748b", margin: 0 }}>
                    Configure organization vault, officer governance, and monthly category budget
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowAddClubModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateClub} className="modal-form-stack" style={{ marginTop: "1rem" }}>
              <div className="form-group-field">
                <label className="form-field-label">
                  Organization / Entity Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input-text"
                  value={newClubName}
                  onChange={(e) => setNewClubName(e.target.value)}
                  placeholder="e.g. Apex Robotics Labs, Global Design Guild, Frontier AI Syndicate"
                  required
                />
              </div>

              <div className="form-group-field">
                <label className="form-field-label">Organization Mission / Description</label>
                <textarea
                  className="form-input-text"
                  rows={2}
                  value={newClubDescription}
                  onChange={(e) => setNewClubDescription(e.target.value)}
                  placeholder="e.g. Global autonomous research team handling collective procurement, grants & member disbursements."
                  style={{ resize: "vertical" }}
                />
              </div>

              <div className="responsive-two-col-inputs">
                <div className="form-group-field">
                  <label className="form-field-label">
                    Financial Officer Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input-text"
                    value={newClubTreasurerName}
                    onChange={(e) => setNewClubTreasurerName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    required
                  />
                </div>

                <div className="form-group-field">
                  <label className="form-field-label">
                    Treasurer / Officer Email <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="email"
                    className="form-input-text"
                    value={newClubTreasurerEmail}
                    onChange={(e) => setNewClubTreasurerEmail(e.target.value)}
                    placeholder="treasurer@organization.org"
                    required
                  />
                </div>
              </div>

              <div className="responsive-two-col-inputs">
                <div className="form-group-field">
                  <label className="form-field-label">
                    Initial Expense Category / Tag <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input-text"
                    value={newClubTagName}
                    onChange={(e) => setNewClubTagName(e.target.value)}
                    placeholder="e.g. Hardware R&D, Operational Supplies"
                    required
                  />
                </div>

                <div className="form-group-field">
                  <label className="form-field-label">
                    Monthly Budget Cap ($)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    className="form-input-text"
                    value={newClubTagLimit}
                    onChange={(e) => setNewClubTagLimit(e.target.value)}
                    placeholder="1500.00"
                    required
                  />
                </div>
              </div>

              <div className="form-group-field">
                <label className="form-field-label">
                  Initial Treasury Vault Seed Funding ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input-text"
                  value={newClubStartingBalance}
                  onChange={(e) => setNewClubStartingBalance(e.target.value)}
                  placeholder="0.00"
                />
                <span style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "0.25rem", display: "block" }}>
                  💡 Optional initial capital deposited into the ledger so the entity can approve claims and disbursements immediately.
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn-cancel-action"
                  onClick={() => setShowAddClubModal(false)}
                  style={{ flex: 1, padding: "0.7rem", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-navy-pill"
                  disabled={creatingClub}
                  style={{
                    flex: 2,
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #4f46e5 0%, #003087 100%)",
                    color: "#ffffff",
                    fontWeight: 700,
                    padding: "0.7rem",
                    borderRadius: "8px",
                  }}
                >
                  {creatingClub ? "Creating Organization..." : "✨ Create Entity & Vault"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: OFFICIAL PAYPAL SANDBOX DIGITAL RECEIPT       */}
      {/* ==================================================== */}
      {viewingReceiptMovement && (
        <div className="modal-overlay" onClick={() => setViewingReceiptMovement(null)}>
          <div
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px", width: "95%", padding: "1.75rem", borderRadius: "16px", background: "#ffffff", boxShadow: "0 20px 40px rgba(0,0,0,0.18)" }}
          >
            {/* Header branding */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "1rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1.3rem" }}>💳</span>
                  <span style={{ fontWeight: 900, fontSize: "1.15rem", color: "#003087", letterSpacing: "-0.02em" }}>
                    PayPal <span style={{ color: "#0070ba" }}>Orbit</span>
                  </span>
                  <span style={{ fontSize: "0.68rem", fontWeight: 800, background: "#e0f2fe", color: "#0369a1", padding: "0.15rem 0.5rem", borderRadius: "9999px" }}>
                    SANDBOX VERIFIED
                  </span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0.2rem 0 0" }}>
                  Official Digital Transaction Receipt & Ledger Certificate
                </p>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setViewingReceiptMovement(null)}
              >
                ✕
              </button>
            </div>

            {/* Receipt Summary Hero */}
            <div style={{ textAlign: "center", padding: "1.25rem 0", background: "#f8fafc", borderRadius: "12px", margin: "1rem 0" }}>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", fontWeight: 700 }}>
                {viewingReceiptMovement.direction === "OUTGOING" ? "Amount Paid / Disbursed" : "Amount Received"}
              </span>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: viewingReceiptMovement.direction === "OUTGOING" ? "#0f172a" : "#059669", marginTop: "0.2rem" }}>
                {formatCurrency(viewingReceiptMovement.amount)}
                {selectedCurrency !== "USD" && (
                  <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600, display: "block" }}>
                    (Original: ${viewingReceiptMovement.amount.toFixed(2)} USD)
                  </span>
                )}
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "0.25rem 0.75rem", borderRadius: "9999px", marginTop: "0.4rem" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981" }} />
                <span style={{ fontSize: "0.74rem", fontWeight: 800, color: "#065f46", textTransform: "uppercase" }}>
                  {viewingReceiptMovement.status}
                </span>
              </div>
            </div>

            {/* Line Item Breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", fontSize: "0.82rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "1rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Transaction Type:</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>
                  {viewingReceiptMovement.type === "CART_PAYMENT" ? "Commercial E-Commerce Order (Orders v2)" : viewingReceiptMovement.type === "SEND" ? "Direct Peer / Member Payout (Payouts v1)" : "Invoice / Receivables (Invoicing v2)"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Counterparty:</span>
                <span style={{ fontWeight: 700, color: "#0070ba" }}>{viewingReceiptMovement.counterparty}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>PayPal Reference ID:</span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", color: "#334155" }}>
                  {viewingReceiptMovement.paypalRefId || viewingReceiptMovement.id}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Category / Tag:</span>
                <span style={{ fontWeight: 700, background: "#f1f5f9", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>
                  {viewingReceiptMovement.tag?.name || "Operations"}
                </span>
              </div>

              {viewingReceiptMovement.club && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Treasury Vault:</span>
                  <span style={{ fontWeight: 700, color: "#4338ca" }}>{viewingReceiptMovement.club.name}</span>
                </div>
              )}

              {viewingReceiptMovement.note && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Memo / Purpose:</span>
                  <span style={{ fontStyle: "italic", color: "#475569" }}>&ldquo;{viewingReceiptMovement.note}&rdquo;</span>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Timestamp:</span>
                <span>{new Date(viewingReceiptMovement.createdAt).toLocaleString()}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #cbd5e1", paddingTop: "0.5rem" }}>
                <span style={{ color: "#64748b" }}>PayPal Sandbox Processing Fee:</span>
                <span style={{ color: "#059669", fontWeight: 700 }}>$0.00 USD (Waived)</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn-navy-pill"
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  background: "#f8fafc",
                  color: "#0f172a",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "0.85rem",
                  padding: "0.65rem",
                  borderRadius: "8px",
                }}
              >
                🖨️ Print Receipt
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setViewingReceiptMovement(null)}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  fontSize: "0.85rem",
                  padding: "0.65rem",
                  borderRadius: "8px",
                  color: "#ffffff",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: USER ACCOUNT PROFILE DIALOG                   */}
      {/* ==================================================== */}
      {showProfileModal && (
        <div className="receipt-modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="receipt-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="receipt-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #003087 0%, #0070ba 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.2rem",
                    fontWeight: 900,
                    boxShadow: "0 4px 12px rgba(0, 48, 135, 0.3)",
                  }}
                >
                  {role === "TREASURER" ? "AR" : "JL"}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 900, color: "#0f172a" }}>
                    {currentSessionName}
                  </h3>
                  <p style={{ margin: "0.15rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                    {currentSessionEmail} • <span style={{ fontWeight: 700, color: "#0070ba" }}>PayPal Orbit Profile</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowProfileModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Account Details Summary */}
            <div style={{ margin: "1.25rem 0 1rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                <span style={{ color: "#64748b" }}>Active Role:</span>
                <span style={{ fontWeight: 800, color: role === "TREASURER" ? "#10b981" : "#0284c7" }}>
                  {role === "TREASURER" ? "Finance Controller (Authorized)" : "Team Contributor"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                <span style={{ color: "#64748b" }}>Associated Entity:</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>
                  {activeClub ? activeClub.name : "Apex Robotics Dynamics Treasury"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span style={{ color: "#64748b" }}>Preferred Display Currency:</span>
                <span style={{ fontWeight: 700, color: "#0070ba" }}>
                  {currencyRates[selectedCurrency]?.label || "$ USD"}
                </span>
              </div>
            </div>

            {/* Direct Pay Link Quick Action */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "0.35rem" }}>
                Your Direct PayPal Payment Link:
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  readOnly
                  value={typeof window !== "undefined" ? `${window.location.origin}/?tab=send-request&recipient=${encodeURIComponent(currentSessionEmail)}` : `https://paypal.me/${currentSessionEmail.split("@")[0]}`}
                  className="form-input-text"
                  style={{ fontSize: "0.82rem", background: "#f1f5f9", color: "#334155" }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const payUrl = typeof window !== "undefined" ? `${window.location.origin}/?tab=send-request&recipient=${encodeURIComponent(currentSessionEmail)}` : "";
                    if (payUrl && navigator.clipboard) {
                      navigator.clipboard.writeText(payUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }
                    setActionNotice({ text: `📋 Copied payment link for ${currentSessionEmail}!`, type: "success" });
                  }}
                  className="btn-navy-pill"
                  style={{
                    whiteSpace: "nowrap",
                    fontSize: "0.8rem",
                    padding: "0.4rem 0.85rem",
                    background: copiedLink ? "#ecfdf5" : "#003087",
                    color: copiedLink ? "#065f46" : "#ffffff",
                    border: copiedLink ? "1.5px solid #10b981" : "none",
                  }}
                >
                  {copiedLink ? "✓ Copied" : "Copy Link"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setShowProfileModal(false);
                  setSendEmail(currentSessionEmail);
                  setSendAmount("20.00");
                  setShowSendModal(true);
                }}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  fontSize: "0.85rem",
                  padding: "0.65rem",
                  borderRadius: "8px",
                  color: "#ffffff",
                }}
              >
                💸 Test Pay Yourself
              </button>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="btn-navy-pill"
                style={{
                  flex: 1,
                  justifyContent: "center",
                  background: "#f1f5f9",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  padding: "0.65rem",
                  borderRadius: "8px",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 3: CONTACT PAYMENT PROFILE & CONSOLIDATION     */}
      {/* ==================================================== */}
      {selectedContactForModal && selectedContactData && (
        <div className="contact-modal-overlay" onClick={() => setSelectedContactForModal(null)}>
          <div className="contact-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="contact-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  className={`contact-avatar ${selectedContactData.isOrg ? "is-org" : ""}`}
                  style={{ width: "42px", height: "42px", fontSize: "1.1rem" }}
                >
                  {selectedContactData.isOrg ? "🏢" : selectedContactData.counterparty.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
                    {selectedContactData.counterparty}
                  </h3>
                  <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                    {selectedContactData.isOrg ? "Organization / Vendor Account" : "Individual / Team Member"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="copilot-icon-btn"
                onClick={() => setSelectedContactForModal(null)}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", fontSize: "1rem" }}
              >
                ✕
              </button>
            </div>

            <div className="contact-modal-body">
              {/* Stat Cards */}
              <div className="contact-stat-grid">
                <div className="contact-stat-card">
                  <div className="contact-stat-value" style={{ color: "#003087" }}>
                    ${selectedContactData.totalSent.toFixed(2)}
                  </div>
                  <div className="contact-stat-label">Total Disbursed</div>
                </div>
                <div className="contact-stat-card">
                  <div className="contact-stat-value" style={{ color: "#047857" }}>
                    ${selectedContactData.totalReceived.toFixed(2)}
                  </div>
                  <div className="contact-stat-label">Total Received</div>
                </div>
                <div className="contact-stat-card">
                  <div className="contact-stat-value" style={{ color: "#6366f1" }}>
                    {selectedContactData.count}
                  </div>
                  <div className="contact-stat-label">Transactions</div>
                </div>
              </div>

              {/* Expense Categories */}
              {selectedContactData.tags.size > 0 && (
                <div style={{ background: "#ffffff", padding: "0.85rem 1rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "0.4rem" }}>
                    Associated Categories:
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {Array.from(selectedContactData.tags).map((tagName) => (
                      <span key={tagName} className="copilot-tag-pill">
                        🏷️ {tagName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Itemized Transactions */}
              <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "1rem" }}>
                <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.92rem", fontWeight: 800, color: "#0f172a" }}>
                  Itemized Payments History ({selectedContactData.allMovements.length})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "240px", overflowY: "auto" }}>
                  {selectedContactData.allMovements.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.6rem 0.75rem",
                        background: "#f8fafc",
                        borderRadius: "8px",
                        border: "1px solid #f1f5f9",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ fontSize: "0.85rem" }}>
                            {m.direction === "OUTGOING" ? "↗" : "↙"}
                          </span>
                          <strong style={{ fontSize: "0.85rem", color: "#0f172a" }}>
                            {m.direction === "OUTGOING" ? "Sent" : "Received"}
                          </strong>
                          <span className={`status-badge-mini ${m.status.toLowerCase()}`}>
                            {m.status}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.15rem" }}>
                          {new Date(m.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} • {m.tag?.name || "General"}
                          {m.note ? ` • "${m.note}"` : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: "0.92rem", fontWeight: 800, color: m.direction === "OUTGOING" ? "#b91c1c" : "#047857" }}>
                        {m.direction === "OUTGOING" ? "-" : "+"} ${m.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="contact-modal-footer">
              <button
                type="button"
                onClick={() => handleConsolidateContact(selectedContactData.counterparty)}
                className="btn-navy-pill"
                style={{ fontSize: "0.82rem", padding: "0.5rem 1rem" }}
              >
                ✨ Consolidate with Copilot
              </button>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContactForModal(null);
                    setSendEmail(selectedContactData.counterparty);
                    setShowSendModal(true);
                  }}
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1d4ed8",
                    borderRadius: "9999px",
                    padding: "0.5rem 1rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  💸 Send Payment
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedContactForModal(null)}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    color: "#475569",
                    borderRadius: "9999px",
                    padding: "0.5rem 1rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* FLOATING & DOCKABLE COPILOT WIDGET                   */}
      {/* ==================================================== */}
      {!copilotOpen && (
        <button
          type="button"
          className={`copilot-dock-trigger dock-${copilotDock}`}
          onClick={() => setCopilotOpen(true)}
          title="Open Orbit AI Financial Copilot"
        >
          <span className="copilot-pulse-dot" />
          <span>✨ Orbit Copilot</span>
        </button>
      )}

      {copilotOpen && (
        <div className={`copilot-floating-panel dock-${copilotDock}`}>
          {/* Header */}
          <div className="copilot-panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="copilot-pulse-dot" />
              <span style={{ fontWeight: 800, fontSize: "0.95rem" }}>Orbit AI Copilot</span>
              <span style={{ fontSize: "0.68rem", background: "rgba(255,255,255,0.18)", padding: "0.15rem 0.45rem", borderRadius: "9999px", fontWeight: 700 }}>
                Gemini 3.5 Flash
              </span>
            </div>
            <div className="copilot-header-actions">
              <button
                type="button"
                className="copilot-icon-btn"
                onClick={() => setCopilotDock(copilotDock === "right" ? "left" : "right")}
                title={`Dock to ${copilotDock === "right" ? "Left" : "Right"}`}
              >
                {copilotDock === "right" ? "⬅ Left" : "Right ➔"}
              </button>
              <button
                type="button"
                className="copilot-icon-btn"
                onClick={() => setCopilotOpen(false)}
                title="Minimize / Close Copilot"
              >
                —
              </button>
              <button
                type="button"
                className="copilot-icon-btn"
                onClick={() => setCopilotOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="copilot-panel-body">
            {/* Quick Suggestion Chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {[
                { label: "🔮 Predict Burn-Rate", query: "analyze this month's burn rate and predict budget overspends" },
                { label: "📊 Consolidate Jordan", query: "consolidate payments for jordan@roboticsclub.org" },
                { label: "🏢 Consolidate Apex Robotics", query: "consolidate payments for Apex Robotics Dynamics" },
                { label: "💳 Food limit?", query: "how close am I to my Food limit?" },
                { label: "📈 Where did money go?", query: "where did our money go? Summarize recent spending from the ledger." },
                { label: "⚠️ Anomalies", query: "check our club finances for any anomalies, spikes, or limit breaches" },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="ai-chip-pill"
                  style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                  onClick={() => {
                    setAiQuery(chip.query);
                    handleRunAiCommand(chip.query);
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Execution Confirmation Result */}
            {aiConfirmedResult && (
              <div style={{ padding: "0.85rem", background: "#ecfdf5", border: "1.5px solid #a7f3d0", borderRadius: "10px", color: "#065f46", fontSize: "0.82rem" }}>
                <strong>✅ Confirmed:</strong> {aiConfirmedResult.message}
              </div>
            )}

            {/* Error Message */}
            {aiError && (
              <div style={{ padding: "0.85rem", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: "10px", color: "#991b1b", fontSize: "0.82rem" }}>
                {aiError}
              </div>
            )}

            {/* Loading Indicator */}
            {aiLoading && (
              <div style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", color: "#4f46e5", background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <span className="spinner-border" style={{ width: "20px", height: "20px", border: "2.5px solid #4f46e5", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontSize: "0.84rem", fontWeight: 700 }}>
                  Analyzing unified ledger & consolidating figures...
                </span>
              </div>
            )}

            {/* Formatted Response */}
            {aiResponse && !aiLoading && (
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                {aiResponse.toolCalls && aiResponse.toolCalls.length > 0 && (
                  <div style={{ marginBottom: "0.6rem", borderBottom: "1px dashed #e2e8f0", paddingBottom: "0.4rem" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginRight: "0.4rem" }}>
                      Tools Invoked:
                    </span>
                    {aiResponse.toolCalls.map((tc, idx) => (
                      <span key={idx} className="ai-tool-badge" style={{ fontSize: "0.68rem" }}>
                        ⚡ {tc.tool} ({tc.durationMs}ms)
                      </span>
                    ))}
                  </div>
                )}

                {renderFormattedCopilotText(aiResponse.text)}

                {/* Interactive Action Draft Card */}
                {aiResponse.draftAction && (
                  <div className="ai-draft-card" style={{ marginTop: "1rem" }}>
                    <span className="ai-draft-badge">Draft: {aiResponse.draftAction.draftType}</span>
                    <h5 style={{ fontSize: "0.95rem", fontWeight: 800, margin: "0.4rem 0 0.2rem 0" }}>
                      {aiResponse.draftAction.summary}
                    </h5>
                    <p style={{ fontSize: "0.76rem", color: "#64748b", margin: "0 0 0.85rem 0" }}>
                      Security Invariant: Verified by server; click below to execute.
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="ai-btn-confirm"
                        onClick={handleConfirmAiDraft}
                        disabled={aiConfirming}
                        style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
                      >
                        {aiConfirming ? "Executing..." : "✓ Confirm & Execute"}
                      </button>
                      <button
                        type="button"
                        className="ai-btn-dismiss"
                        onClick={handleDismissAiDraft}
                        disabled={aiConfirming}
                        style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Input */}
          <div className="copilot-panel-footer">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunAiCommand();
              }}
              style={{ display: "flex", gap: "0.45rem" }}
            >
              <input
                type="text"
                className="form-input-text"
                placeholder="Ask Copilot or 'consolidate payments for...'..."
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                disabled={aiLoading}
                style={{ fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}
              />
              <button
                type="submit"
                className="btn-navy-pill"
                disabled={aiLoading || !aiQuery.trim()}
                style={{ fontSize: "0.82rem", padding: "0.5rem 0.85rem", minWidth: "70px", justifyContent: "center" }}
              >
                {aiLoading ? "..." : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. FOOTER WITH MANDATORY DISCLAIMER */}
      <footer className="site-footer-bar">
        <span className="footer-prototype-badge">Sandbox Simulation Environment</span>
        <p className="footer-legal-notice">
          Independent prototype, not an official PayPal product. Sandbox only; never ask for or
          enter live PayPal login details.
        </p>
      </footer>

      {/* ==================================================== */}
      {/* ANIMATED PAYMENT SUCCESS TICK MODAL                  */}
      {/* ==================================================== */}
      {paymentSuccessData && (
        <div
          className="pay-success-overlay"
          onClick={() => setPaymentSuccessData(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="pay-success-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Confetti Explosion Particles */}
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
              {[
                { x: "-60px", y: "-80px", rot: "120deg", bg: "#10b981", left: "50%", top: "40%" },
                { x: "70px", y: "-90px", rot: "-140deg", bg: "#0070ba", left: "50%", top: "40%" },
                { x: "-90px", y: "-30px", rot: "90deg", bg: "#f59e0b", left: "50%", top: "40%" },
                { x: "85px", y: "-20px", rot: "-80deg", bg: "#8b5cf6", left: "50%", top: "40%" },
                { x: "-70px", y: "60px", rot: "180deg", bg: "#06b6d4", left: "50%", top: "40%" },
                { x: "65px", y: "70px", rot: "-160deg", bg: "#10b981", left: "50%", top: "40%" },
                { x: "0px", y: "-110px", rot: "45deg", bg: "#f43f5e", left: "50%", top: "40%" },
                { x: "-35px", y: "-100px", rot: "-60deg", bg: "#003087", left: "50%", top: "40%" },
                { x: "40px", y: "-100px", rot: "75deg", bg: "#10b981", left: "50%", top: "40%" },
              ].map((p, idx) => (
                <div
                  key={idx}
                  className="pay-confetti-particle"
                  style={{
                    left: p.left,
                    top: p.top,
                    background: p.bg,
                    ["--confetti-dest" as any]: `translate(${p.x}, ${p.y})`,
                    ["--confetti-rot" as any]: p.rot,
                  }}
                />
              ))}
            </div>

            {/* Animated Checkmark with Pulsing Aura */}
            <div className="pay-tick-wrapper">
              <div className="pay-tick-pulse-ring" />
              <div className="pay-tick-pulse-ring-outer" />
              <svg
                className="pay-checkmark-svg"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 52 52"
              >
                <circle
                  className="pay-checkmark-circle"
                  cx="26"
                  cy="26"
                  r="23"
                />
                <path
                  className="pay-checkmark-check"
                  fill="none"
                  d="M14.1 27.2l7.1 7.2 16.7-16.8"
                />
              </svg>
            </div>

            {/* Header Titles */}
            <h3 className="pay-success-title">{paymentSuccessData.title}</h3>
            <p className="pay-success-sub">
              Transaction verified and recorded to the unified financial ledger.
            </p>

            {/* Amount Badge */}
            {paymentSuccessData.amount !== undefined && paymentSuccessData.amount !== null && (
              <div>
                <div className="pay-success-amount-pill">
                  <span>$</span>
                  {typeof paymentSuccessData.amount === "number"
                    ? paymentSuccessData.amount.toFixed(2)
                    : parseFloat(String(paymentSuccessData.amount) || "0").toFixed(2)}
                  <span style={{ fontSize: "0.85rem", marginLeft: "0.2rem" }}>USD</span>
                </div>
              </div>
            )}

            {/* Receipt Summary Details */}
            <div className="pay-success-details-box">
              {paymentSuccessData.recipient && (
                <div className="pay-success-detail-row">
                  <span className="pay-success-detail-label">To / Recipient:</span>
                  <span className="pay-success-detail-val">{paymentSuccessData.recipient}</span>
                </div>
              )}
              {paymentSuccessData.note && (
                <div className="pay-success-detail-row">
                  <span className="pay-success-detail-label">Description:</span>
                  <span className="pay-success-detail-val" style={{ maxWidth: "200px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {paymentSuccessData.note}
                  </span>
                </div>
              )}
              {paymentSuccessData.refId && (
                <div className="pay-success-detail-row">
                  <span className="pay-success-detail-label">Reference ID:</span>
                  <span className="pay-success-detail-val" style={{ fontFamily: "monospace", fontSize: "0.76rem" }}>
                    {paymentSuccessData.refId}
                  </span>
                </div>
              )}
              <div className="pay-success-detail-row">
                <span className="pay-success-detail-label">Status:</span>
                <span className="pay-success-detail-val" style={{ color: "#059669", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <span>●</span> Completed
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
              <button
                type="button"
                className="btn-navy-pill"
                style={{
                  flex: 1,
                  justifyContent: "center",
                  background: "#f1f5f9",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  padding: "0.75rem",
                  borderRadius: "9999px",
                }}
                onClick={() => {
                  const matched = movements.find((m) => m.paypalRefId === paymentSuccessData.refId || m.counterparty === paymentSuccessData.recipient);
                  if (matched) {
                    setViewingReceiptMovement(matched);
                  } else {
                    setViewingReceiptMovement({
                      id: `REC-${Date.now().toString().slice(-6)}`,
                      type: "SEND",
                      direction: "OUTGOING",
                      counterparty: paymentSuccessData.recipient || "Authorized Vendor",
                      amount: typeof paymentSuccessData.amount === "number" ? paymentSuccessData.amount : parseFloat(String(paymentSuccessData.amount) || "0"),
                      currency: selectedCurrency,
                      tag: { id: "demo", name: "Operations" },
                      status: "COMPLETED",
                      paypalRefId: paymentSuccessData.refId || `PAYID-${Date.now().toString().slice(-8)}`,
                      invoiceUrl: null,
                      note: paymentSuccessData.note || "Payment",
                      club: activeClub ? { id: activeClub.id, name: activeClub.name } : null,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    } as any);
                  }
                }}
              >
                🧾 Digital Receipt
              </button>
              <button
                type="button"
                className="pay-success-btn-done"
                style={{ flex: 1, margin: 0 }}
                onClick={() => setPaymentSuccessData(null)}
                autoFocus
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. NATIVE MOBILE BOTTOM NAVIGATION DOCK (Visible on mobile <= 768px) */}
      <nav className="mobile-bottom-dock" aria-label="Mobile Navigation Dock">
        <button
          type="button"
          className={`mobile-dock-btn ${activeTab === "home" ? "active" : ""}`}
          onClick={() => setActiveTab("home")}
          title="Home Dashboard"
        >
          <span className="mobile-dock-icon">🏠</span>
          <span className="mobile-dock-label">Home</span>
          {activeTab === "home" && <span className="mobile-dock-dot" />}
        </button>

        <button
          type="button"
          className={`mobile-dock-btn ${activeTab === "send-request" ? "active" : ""}`}
          onClick={() => setActiveTab("send-request")}
          title="Send and Request Money"
        >
          <span className="mobile-dock-icon">💸</span>
          <span className="mobile-dock-label">Send & Pay</span>
          {activeTab === "send-request" && <span className="mobile-dock-dot" />}
        </button>

        <button
          type="button"
          className={`mobile-dock-btn ${activeTab === "instamart" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("instamart");
            if (products.length === 0) searchProducts("coffee");
          }}
          title="Instamart Store"
        >
          <div style={{ position: "relative", display: "inline-block" }}>
            <span className="mobile-dock-icon">🛍️</span>
            {cartItems.length > 0 && (
              <span className="mobile-dock-badge">{cartItems.length}</span>
            )}
          </div>
          <span className="mobile-dock-label">Shop</span>
          {activeTab === "instamart" && <span className="mobile-dock-dot" />}
        </button>

        <button
          type="button"
          className={`mobile-dock-btn ${activeTab === "club" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("club");
            if (activeClub) {
              fetchClubDues(activeClub.id);
              fetchClubClaims(activeClub.id);
              fetchClubLedger(activeClub.id);
            }
          }}
          title="Clubs & Treasury"
        >
          <span className="mobile-dock-icon">🏛️</span>
          <span className="mobile-dock-label">Treasury</span>
          {activeTab === "club" && <span className="mobile-dock-dot" />}
        </button>

        <button
          type="button"
          className={`mobile-dock-btn ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
          title="Profile & Instant QR"
        >
          <span className="mobile-dock-icon">👤</span>
          <span className="mobile-dock-label">Profile & QR</span>
          {activeTab === "profile" && <span className="mobile-dock-dot" />}
        </button>
      </nav>
    </div>
  );
}
