import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  getIntlLocale,
  getLocaleDisplayName,
  getStoredLocale,
  setStoredLocale,
  type Locale,
} from "./config";
import { translate, translateLoose, type TranslationParams } from "./messages";

interface I18nContextValue {
  locale: Locale;
  localeLabel: string;
  setLocale: (locale: Locale) => void;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  tx: (source: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
// Preserve original authored text so DOM-level translation can always re-run from the English source string.
const ORIGINAL_TEXT_BY_NODE = new WeakMap<Text, string>();
const ORIGINAL_ATTRIBUTES_BY_ELEMENT = new WeakMap<Element, Map<string, string>>();
// Limit DOM translation to user-facing text attributes; structural/data attributes must remain untouched.
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;

function applyWhitespacePreservingTranslation(original: string, translatedCore: string): string {
  // Keep leading/trailing whitespace exactly as-authored so inline JSX formatting does not shift after translation.
  const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) {
    return translatedCore;
  }
  return `${match[1]}${translatedCore}${match[3]}`;
}

function getRenderedDomText(original: string, locale: Locale): string {
  // English keeps the source text verbatim; only zh-CN needs the loose DOM translation fallback.
  const trimmedOriginal = original.trim();
  if (!trimmedOriginal) {
    return original;
  }

  return locale === "zh-CN"
    ? applyWhitespacePreservingTranslation(original, translateLoose(locale, trimmedOriginal))
    : original;
}

function shouldRefreshStoredText(currentText: string, originalText: string): boolean {
  // React can reuse the same text node for a different string, so treat any value outside the stored source/translated pair as new source text.
  const translatedOriginal = getRenderedDomText(originalText, "zh-CN");
  return currentText !== originalText && currentText !== translatedOriginal;
}

function translateDomTextNode(textNode: Text, locale: Locale) {
  // Text nodes can be reused by React, so refresh the cached source whenever the live node no longer matches either known form.
  const currentText = textNode.textContent ?? "";
  let originalText = ORIGINAL_TEXT_BY_NODE.get(textNode) ?? currentText;
  if (!ORIGINAL_TEXT_BY_NODE.has(textNode)) {
    ORIGINAL_TEXT_BY_NODE.set(textNode, originalText);
  } else if (shouldRefreshStoredText(currentText, originalText)) {
    originalText = currentText;
    ORIGINAL_TEXT_BY_NODE.set(textNode, originalText);
  }

  if (!originalText.trim()) {
    return;
  }

  const nextText = getRenderedDomText(originalText, locale);

  if (textNode.textContent !== nextText) {
    textNode.textContent = nextText;
  }
}

function translateDomAttributes(element: Element, locale: Locale) {
  // Track original attribute values separately so toggling languages never compounds translations on the same element.
  const originalAttributes = ORIGINAL_ATTRIBUTES_BY_ELEMENT.get(element) ?? new Map<string, string>();

  TRANSLATABLE_ATTRIBUTES.forEach((attributeName) => {
    const attributeValue = element.getAttribute(attributeName);
    if (attributeValue === null) {
      return;
    }

    if (!originalAttributes.has(attributeName)) {
      originalAttributes.set(attributeName, attributeValue);
    }

    let originalValue = originalAttributes.get(attributeName) ?? attributeValue;
    if (shouldRefreshStoredText(attributeValue, originalValue)) {
      originalValue = attributeValue;
      originalAttributes.set(attributeName, originalValue);
    }
    const nextValue = locale === "zh-CN" ? translateLoose(locale, originalValue) : originalValue;

    if (attributeValue !== nextValue) {
      element.setAttribute(attributeName, nextValue);
    }
  });

  if (originalAttributes.size > 0) {
    ORIGINAL_ATTRIBUTES_BY_ELEMENT.set(element, originalAttributes);
  }
}

function translateDomTree(root: Node, locale: Locale) {
  // Walk both text nodes and whitelisted attributes so older components without tx() still localize after render.
  if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
    if (root instanceof Text) {
      translateDomTextNode(root, locale);
    }
    return;
  }

  if (root instanceof Element) {
    translateDomAttributes(root, locale);
  }

  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentTextNode = textWalker.nextNode();
  while (currentTextNode) {
    translateDomTextNode(currentTextNode as Text, locale);
    currentTextNode = textWalker.nextNode();
  }

  const elementWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let currentElement = elementWalker.nextNode() as Element | null;
  while (currentElement) {
    translateDomAttributes(currentElement, locale);
    currentElement = elementWalker.nextNode() as Element | null;
  }
}

function createI18nValue(locale: Locale, setLocale: (locale: Locale) => void): I18nContextValue {
  // Package formatting helpers with locale state so components can read one coherent i18n surface from context.
  return {
    locale,
    localeLabel: getLocaleDisplayName(locale),
    setLocale,
    formatDate: (value, options) =>
      new Intl.DateTimeFormat(getIntlLocale(locale), options).format(new Date(value)),
    tx: (source, params) => translate(locale, source, params),
  };
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

  useEffect(() => {
    document.documentElement.lang = getIntlLocale(locale);
    setStoredLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) {
      return undefined;
    }

    // Skip DOM mutation translation in tests so jsdom snapshots stay deterministic and focused on component output.
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return undefined;
    }

    // Translate the current tree immediately, then keep future DOM mutations in sync for legacy untranslated markup.
    translateDomTree(document.body, locale);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            translateDomTree(node, locale);
          });
        }

        if (mutation.type === "characterData" && mutation.target instanceof Text) {
          translateDomTextNode(mutation.target, locale);
        }

        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateDomAttributes(mutation.target, locale);
        }
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => {
      observer.disconnect();
    };
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => createI18nValue(locale, (nextLocale) => {
      setLocaleState(nextLocale);
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  const fallbackLocale = getStoredLocale();
  // Expose a no-op fallback outside the provider so helper calls stay safe in tests and isolated utilities.
  const fallbackValue = useMemo(
    () => createI18nValue(fallbackLocale, () => {}),
    [fallbackLocale]
  );
  return context ?? fallbackValue;
}

export function getInitialLocale(): Locale {
  // Keep the initial locale deterministic for tests and any future non-React bootstrap code.
  return DEFAULT_LOCALE;
}
