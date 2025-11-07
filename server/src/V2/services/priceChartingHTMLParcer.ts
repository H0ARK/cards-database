/**
 * PriceCharting HTML Parser (Browser Version)
 * Parses PriceCharting HTML pages to extract eBay sold listings data
 * Works in the browser using DOMParser
 */

import type {
  PriceChartingData,
  PriceChartingSale,
  PriceChartingStats,
} from "@/hooks/usePriceChartingData";

/**
 * Parse PriceCharting HTML and extract eBay sold listings
 */
export function parsePriceChartingHTML(html: string): PriceChartingData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Early reject obvious non-PriceCharting HTML (e.g., dev server fallback)
    const rawTitle = doc.querySelector("title")?.textContent?.trim() || "";
    const isPriceCharting =
      !!doc.querySelector(
        'meta[property="og:site_name"][content*="PriceCharting"]',
      ) ||
      !!doc.querySelector('link[rel="canonical"][href*="pricecharting.com"]') ||
      /PriceCharting/i.test(rawTitle) ||
      !!doc.querySelector(
        '.completed-auctions, [class*="completed-auctions"]',
      ) ||
      !!doc.querySelector('tr[id^="ebay-"], a.js-ebay-completed-sale');

    if (!isPriceCharting) {
      console.warn(
        "⚠️  Provided HTML does not appear to be a PriceCharting page. Skipping parse.",
      );
      return null;
    }

    // Extract card information from the title
    const title = rawTitle;
    // Robust title parsing: "<Card Name> #<num> Prices | <Set Name> | PriceCharting"
    const detailedTitleMatch = title.match(
      /(.+?)\s+#(\d+)\s+Prices\s+\|\s+(.+?)\s+\|/,
    );
    const simpleTitleMatch = title.match(/(.+?)\s+#(\d+)\s+Prices/);

    const cardInfo = {
      cardName: (detailedTitleMatch?.[1] || simpleTitleMatch?.[1] || "").trim(),
      cardNumber: (
        detailedTitleMatch?.[2] ||
        simpleTitleMatch?.[2] ||
        ""
      ).trim(),
      setName: (detailedTitleMatch?.[3] || "").trim(),
      pageTitle: title,
    };

    // Fallback set name from breadcrumbs or headings if needed
    if (!cardInfo.setName) {
      const candidates = Array.from(doc.querySelectorAll("a, h1, h2, h3"));
      for (const el of candidates) {
        const text = el.textContent?.trim() || "";
        if (/Pokemon/i.test(text) && !/Pokemon Cards/i.test(text)) {
          cardInfo.setName = text.replace(/^\s*Pokemon\s+/i, "").trim();
          break;
        }
      }
    }

    console.log(
      `🎴 Parsing PriceCharting HTML: ${cardInfo.cardName} #${cardInfo.cardNumber} from ${cardInfo.setName}`,
    );

    const listingsByCondition: Record<string, PriceChartingSale[]> = {};
    const allListings: PriceChartingSale[] = [];
    const statsByCondition: Record<string, PriceChartingStats> = {};

    const conditionLabelOverrides: Record<string, string> = {};
    doc
      .querySelectorAll('#completed-auctions-condition option[value]')
      .forEach((option) => {
        const rawValue = option.getAttribute("value")?.trim();
        if (!rawValue) return;
        const text = option.textContent?.trim() || "";
        const label = text.replace(/\s*\(.*\)$/, "").trim();
        if (label) {
          conditionLabelOverrides[rawValue] = label;
        }
      });

    // Helpers to infer and normalize condition labels
    const normalizeCondition = (raw: string): string | null => {
      const text = raw || "";
      if (/un[-\s]?graded|(^|\W)raw(\W|$)/i.test(text)) return "Ungraded";
      // BGS Black Label explicitly
      if (/BGS\s*10.*Black/i.test(text)) return "BGS 10 Black";
      // CGC 10 Pristine variants
      if (/CGC/i.test(text) && /Prist(?:ine|\.)/i.test(text)) {
        return "CGC 10 Pristine";
      }
      // Generic slab grades
      const m = /(PSA|BGS|CGC|SGC|TAG|ACE)\s*([0-9]+(?:\.[0-9])?)/i.exec(text);
      if (m) {
        const brand = m[1].toUpperCase();
        const grade = m[2];
        switch (brand) {
          case "PSA":
            return `PSA ${grade}`;
          case "BGS":
            // If "Black" mentioned, we handled earlier
            return `BGS ${grade}`;
          case "CGC":
            return `CGC ${grade}`;
          case "SGC":
            return `SGC ${grade}`;
          case "TAG":
            return `TAG ${grade}`;
          case "ACE":
            return `ACE ${grade}`;
        }
      }
      return null;
    };

    const inferConditionFromText = (text: string): string | null => {
      return normalizeCondition(text || "");
    };

    const inferConditionFromContext = (
      root: Element,
      defaultLabel: string,
    ): string => {
      // Look at a few previous siblings for headings/labels
      let el: Element | null = root;
      let steps = 0;
      while (el && steps < 6) {
        el = el.previousElementSibling;
        steps++;
        if (!el) break;

        const t = (el.textContent || "").trim();
        const inferred = inferConditionFromText(t);
        if (inferred) return inferred;
        if (/Ungraded/i.test(t)) return "Ungraded";

        // Try headings within the element
        const heading = (el as HTMLElement).querySelector?.(
          "h1,h2,h3,h4,strong,em",
        );
        if (heading) {
          const ht = (heading.textContent || "").trim();
          const fromHeading = inferConditionFromText(ht);
          if (fromHeading) return fromHeading;
        }
      }
      return defaultLabel;
    };

    // Define known condition sections used by PriceCharting
    const conditionSections: Array<{ key: string; fallbackLabel: string }> = [
      { key: "completed-auctions-used", fallbackLabel: "Ungraded" },
      { key: "completed-auctions-cib", fallbackLabel: "Grade 7" },
      { key: "completed-auctions-new", fallbackLabel: "Grade 8" },
      { key: "completed-auctions-graded", fallbackLabel: "Grade 9" },
      { key: "completed-auctions-box-only", fallbackLabel: "Grade 9.5" },
      { key: "completed-auctions-manual-only", fallbackLabel: "PSA 10" },
      { key: "completed-auctions-loose-and-box", fallbackLabel: "BGS 10" },
      { key: "completed-auctions-grade-seventeen", fallbackLabel: "CGC 10" },
      {
        key: "completed-auctions-grade-eighteen",
        fallbackLabel: "SGC 10",
      },
      {
        key: "completed-auctions-grade-nineteen",
        fallbackLabel: "CGC 10 Pristine",
      },
      {
        key: "completed-auctions-grade-twenty",
        fallbackLabel: "BGS 10 Black",
      },
      { key: "completed-auctions-grade-twenty-one", fallbackLabel: "TAG 10" },
      { key: "completed-auctions-grade-twenty-two", fallbackLabel: "ACE 10" },
      { key: "completed-auctions-grade-six", fallbackLabel: "Grade 6" },
      { key: "completed-auctions-grade-five", fallbackLabel: "Grade 5" },
      { key: "completed-auctions-grade-four", fallbackLabel: "Grade 4" },
      { key: "completed-auctions-grade-three", fallbackLabel: "Grade 3" },
      {
        key: "completed-auctions-box-and-manual",
        fallbackLabel: "Grade 2",
      },
      {
        key: "completed-auctions-loose-and-manual",
        fallbackLabel: "Grade 1",
      },
    ];

    // Helper to parse a section into listings
    const parseSectionRows = (root: Element, conditionLabel: string) => {
      const sectionListings: PriceChartingSale[] = [];
      const sectionLabel = inferConditionFromContext(root, conditionLabel);
      const rows = root.querySelectorAll(
        'tbody tr[id^="ebay-"], tr[id^="ebay-"]',
      );
      for (const row of Array.from(rows)) {
        try {
          const rowId = row.getAttribute("id") || "";
          const ebayIdFromId = rowId.startsWith("ebay-")
            ? rowId.replace("ebay-", "")
            : "";

          const dateText =
            row.querySelector("td.date")?.textContent?.trim() ||
            row.querySelector("td")?.textContent?.trim() ||
            "";

          const titleAnchor =
            row.querySelector("td.title a.js-ebay-completed-sale") ||
            row.querySelector("a.js-ebay-completed-sale") ||
            row.querySelector("td.title a");

          const href = titleAnchor?.getAttribute("href") || "";
          const titleText =
            titleAnchor?.textContent?.trim() ||
            row.querySelector("td.title")?.textContent?.trim() ||
            "";

          const priceEl =
            row.querySelector("td.numeric .js-price") ||
            row.querySelector("td.numeric") ||
            row.querySelector("td:nth-child(4)");

          const priceText = (priceEl?.textContent || "").trim();
          const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
          const price = priceMatch
            ? parseFloat(priceMatch[1].replace(/,/g, ""))
            : 0;

          const ebayIdFromHref = (href.match(/\/itm\/(\d+)/) || [])[1] || "";
          const ebayId = ebayIdFromId || ebayIdFromHref;

          const imageUrl =
            row.querySelector("td.image a")?.getAttribute("href") ||
            row.querySelector("td.image img")?.getAttribute("data-src") ||
            row.querySelector("td.image img")?.getAttribute("src") ||
            null;

          if (ebayId && price > 0 && dateText && href) {
            const url = href.startsWith("http")
              ? href
              : `https://www.ebay.com${href}`;
            const rowLabel = inferConditionFromText(titleText) || sectionLabel;
            const sale: PriceChartingSale = {
              ebayId,
              condition: rowLabel,
              date: dateText,
              title: titleText,
              price,
              priceText,
              url,
              imageUrl,
            };
            sectionListings.push(sale);
            allListings.push(sale);
          }
        } catch (err) {
          console.warn("Failed to parse completed auction row:", err);
        }
      }
      return sectionListings;
    };

    // Parse known condition sections first (most reliable)
    for (const { key, fallbackLabel } of conditionSections) {
      const selector = `.${key}`;
      const resolvedLabel = conditionLabelOverrides[key] || fallbackLabel;
      const sections = Array.from(doc.querySelectorAll(selector));
      for (const section of sections) {
        const conditionListings = parseSectionRows(section, resolvedLabel);
        if (conditionListings.length > 0) {
          // Group by inferred condition label (rows may contain mixed slab grades)
          const grouped: Record<string, PriceChartingSale[]> = {};
          for (const sale of conditionListings) {
            const key = sale.condition || resolvedLabel;
            (grouped[key] ||= []).push(sale);
          }

          for (const [cond, groupListings] of Object.entries(grouped)) {
            if (!listingsByCondition[cond]) listingsByCondition[cond] = [];
            listingsByCondition[cond].push(...groupListings);

            // Calculate statistics for this condition
            const prices = groupListings
              .map((l) => l.price)
              .sort((a, b) => a - b);
            const dates = groupListings
              .map((l) => l.date)
              .filter(Boolean)
              .sort();
            statsByCondition[cond] = {
              count: groupListings.length,
              min: Math.min(...prices),
              max: Math.max(...prices),
              avg: prices.reduce((sum, p) => sum + p, 0) / groupListings.length,
              median: prices[Math.floor(prices.length / 2)],
              dateRange: {
                earliest: dates[0] || "",
                latest: dates[dates.length - 1] || "",
              },
            };
            console.log(
              `  ✅ ${cond}: ${groupListings.length} listings (avg: $${statsByCondition[cond].avg.toFixed(2)})`,
            );
          }
        }
      }
    }

    // Fallback: if nothing parsed yet, try generic rows anywhere on page
    if (allListings.length === 0) {
      const genericListings = parseSectionRows(doc.body, "Ungraded");
      if (genericListings.length > 0) {
        const groups: Record<string, PriceChartingSale[]> = {};
        for (const sale of genericListings) {
          const key = sale.condition || "Ungraded";
          (groups[key] ||= []).push(sale);
        }
        for (const [cond, groupListings] of Object.entries(groups)) {
          if (!listingsByCondition[cond]) listingsByCondition[cond] = [];
          listingsByCondition[cond].push(...groupListings);

          const prices = groupListings
            .map((l) => l.price)
            .sort((a, b) => a - b);
          const dates = groupListings
            .map((l) => l.date)
            .filter(Boolean)
            .sort();
          statsByCondition[cond] = {
            count: groupListings.length,
            min: Math.min(...prices),
            max: Math.max(...prices),
            avg: prices.reduce((sum, p) => sum + p, 0) / groupListings.length,
            median: prices[Math.floor(prices.length / 2)],
            dateRange: {
              earliest: dates[0] || "",
              latest: dates[dates.length - 1] || "",
            },
          };
          console.log(
            `  ✅ Fallback ${cond}: ${groupListings.length} listings (avg: $${statsByCondition[cond].avg.toFixed(2)})`,
          );
        }
      }
    }

    // Calculate overall statistics
    if (allListings.length > 0) {
      const allPrices = allListings.map((l) => l.price).sort((a, b) => a - b);
      const allDates = allListings
        .map((l) => l.date)
        .filter((d) => d)
        .sort();

      const overallStats: PriceChartingStats = {
        count: allListings.length,
        min: Math.min(...allPrices),
        max: Math.max(...allPrices),
        avg: allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length,
        median: allPrices[Math.floor(allPrices.length / 2)],
        dateRange: {
          earliest: allDates[0] || "",
          latest: allDates[allDates.length - 1] || "",
        },
      };

      const result: PriceChartingData = {
        cardInfo,
        stats: {
          overall: overallStats,
          byCondition: statsByCondition,
        },
        listingsByCondition,
        allListings,
        metadata: {
          parsedAt: new Date().toISOString(),
          totalListings: allListings.length,
          conditions: Object.keys(listingsByCondition).length,
        },
      };

      console.log(
        `✅ Successfully parsed ${result.metadata.totalListings} listings across ${result.metadata.conditions} conditions`,
      );

      return result;
    }

    // Clearer diagnostics to help understand parsing failures
    const ebayRowCount = doc.querySelectorAll('tr[id^="ebay-"]').length;
    const completedAnchorCount = doc.querySelectorAll(
      "a.js-ebay-completed-sale",
    ).length;
    const hasCompletedSections = !!doc.querySelector(
      '[class*="completed-auctions"]',
    );
    const canonicalUrl =
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || null;
    console.warn(
      `⚠️  No listings found in HTML (ebayRows=${ebayRowCount}, completedAnchors=${completedAnchorCount}, hasCompletedSections=${hasCompletedSections})`,
      canonicalUrl ? { canonicalUrl } : undefined,
    );
    return null;
  } catch (err) {
    console.error("❌ Failed to parse PriceCharting HTML:", err);
    return null;
  }
}

/**
 * Fetch and parse PriceCharting data from a URL
 */
export async function fetchAndParsePriceChartingData(
  url: string,
): Promise<PriceChartingData | null> {
  try {
    console.log(`🌐 Fetching PriceCharting data from: ${url}`);

    // Note: Direct fetching will likely be blocked by CORS
    // This function is here for future use with a proxy
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parsePriceChartingHTML(html);
  } catch (err) {
    console.error("❌ Failed to fetch PriceCharting data:", err);
    return null;
  }
}
