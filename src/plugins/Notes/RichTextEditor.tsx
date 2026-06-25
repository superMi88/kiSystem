import React, { useRef, useEffect } from 'react';

export interface RichTextEditorProps {
  /** The initial or current HTML value of the editor */
  value?: string;
  /** Callback triggered when the content changes. Returns both clean HTML and serialized Markdown. */
  onChange?: (html: string, markdown: string) => void;
  /** Placeholder text when the editor is empty */
  placeholder?: string;
  /** Custom CSS class for the editor container */
  className?: string;
  /** Custom style object for the editor container */
  style?: React.CSSProperties;
}

/**
 * RichTextEditor Component
 * A React wrapper around a contenteditable editor that renders link pills [Text](URL)
 * visually, keeps data-url in the DOM, converts pills to Markdown on copy,
 * sanitizes HTML to prevent XSS on paste, and treats pills as atomic characters.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value = '',
  onChange,
  placeholder = 'Schreibe hier...',
  className = '',
  style
}: RichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInputtingRef = useRef<boolean>(false);

  // Helper: Convert HTML editor content to Plain Markdown string [Text](URL)
  const getMarkdownFromHtml = (html: string): string => {
    if (typeof window === 'undefined') return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const pills = tempDiv.querySelectorAll('.link-pill');
    pills.forEach((pill) => {
      const text = pill.textContent || '';
      const url = pill.getAttribute('data-url') || '';
      const mdText = document.createTextNode(`[${text}](${url})`);
      pill.parentNode?.replaceChild(mdText, pill);
    });

    // Replace line break tags with newlines
    const brs = tempDiv.querySelectorAll('br');
    brs.forEach((br) => {
      br.parentNode?.replaceChild(document.createTextNode('\n'), br);
    });

    return tempDiv.textContent || '';
  };

  // Sync incoming value prop with editor content (only if not currently typing)
  useEffect(() => {
    if (editorRef.current && !isInputtingRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value]);

  // Handle text input and trigger onChange callbacks
  const handleInput = () => {
    if (!editorRef.current) return;
    isInputtingRef.current = true;
    const html = editorRef.current.innerHTML;
    const markdown = getMarkdownFromHtml(html);
    if (onChange) {
      onChange(html, markdown);
    }
    // Reset typing flag at the end of execution stack
    setTimeout(() => {
      isInputtingRef.current = false;
    }, 0);
  };

  // --- Clipboard Copy & Cut Event Handlers ---
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    // 1. Process for plain-text clipboard (convert link pills to Markdown links)
    const pills = container.querySelectorAll('.link-pill');
    pills.forEach((pill) => {
      const text = pill.textContent || '';
      const url = pill.getAttribute('data-url') || '';
      const mdText = document.createTextNode(`[${text}](${url})`);
      pill.parentNode?.replaceChild(mdText, pill);
    });
    const plainTextMarkdown = container.textContent || '';

    // 2. Process for HTML clipboard (keeps CSS link pills structure intact internally)
    const htmlContainer = document.createElement('div');
    htmlContainer.appendChild(range.cloneContents());
    const htmlText = htmlContainer.innerHTML;

    e.clipboardData.setData('text/plain', plainTextMarkdown);
    e.clipboardData.setData('text/html', htmlText);
    e.preventDefault();
  };

  const handleCut = (e: React.ClipboardEvent<HTMLDivElement>) => {
    handleCopy(e);
    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      selection.getRangeAt(0).deleteContents();
    }
    handleInput();
  };

  // --- Clipboard Paste Event Handler with XSS Sanitizer ---
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();

    const htmlData = e.clipboardData.getData('text/html');
    const plainText = e.clipboardData.getData('text/plain');

    let parsedHtml = '';

    if (htmlData) {
      parsedHtml = sanitizeAndParseHtml(htmlData);
    } else if (plainText) {
      parsedHtml = parseMarkdownToHtml(plainText);
    }

    if (parsedHtml) {
      insertHtmlAtCaret(parsedHtml);
      handleInput();
    }
  };

  // XSS Clean HTML + parse normal links into pills
  const sanitizeAndParseHtml = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;

    // Remove harmful tags
    const forbiddenTags = [
      'script', 'iframe', 'object', 'embed', 'style', 'meta', 'link',
      'applet', 'frameset', 'frame', 'audio', 'video', 'canvas', 'svg'
    ];
    forbiddenTags.forEach((tag) => {
      body.querySelectorAll(tag).forEach((el) => el.remove());
    });

    // Remove inline event handlers & filter malicious javascript: href links
    body.querySelectorAll('*').forEach((el) => {
      const attrs = Array.from(el.attributes);
      attrs.forEach((attr) => {
        if (attr.name.toLowerCase().startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        if (['href', 'src', 'data-url'].includes(attr.name.toLowerCase())) {
          if (attr.value.trim().toLowerCase().startsWith('javascript:')) {
            el.removeAttribute(attr.name);
          }
        }
      });
    });

    // Convert standard <a> tags to styled .link-pill badges
    body.querySelectorAll('a').forEach((a) => {
      const text = a.textContent || '';
      const href = a.getAttribute('href') || '';
      if (text && href && !href.trim().toLowerCase().startsWith('javascript:')) {
        const pill = document.createElement('span');
        pill.className = 'link-pill';
        pill.setAttribute('contenteditable', 'false');
        pill.setAttribute('data-url', href);
        pill.textContent = text;
        a.parentNode?.replaceChild(pill, a);
      } else {
        a.remove();
      }
    });

    // Enforce contenteditable="false" on existing link-pills
    body.querySelectorAll('.link-pill').forEach((pill) => {
      pill.setAttribute('contenteditable', 'false');
      const url = pill.getAttribute('data-url') || '';
      if (url.trim().toLowerCase().startsWith('javascript:')) {
        pill.removeAttribute('data-url');
      }
    });

    return body.innerHTML;
  };

  // Convert plain-text Markdown [Text](URL) to link-pills while escaping raw HTML
  const parseMarkdownToHtml = (text: string): string => {
    // HTML Escape text first to prevent raw script injections
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // RegEx match for markdown format: [Label](URL)
    const mdRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    escaped = escaped.replace(mdRegex, (match, textVal, urlVal) => {
      const cleanUrl = urlVal.trim();
      // Block protocol javascript:
      if (cleanUrl.toLowerCase().startsWith('javascript:')) {
        return match;
      }
      return `<span class="link-pill" contenteditable="false" data-url="${cleanUrl}">${textVal}</span>\u200B`;
    });

    // Retain newline formatting in contenteditable editor
    return escaped.replace(/\n/g, '<br>');
  };

  // Insert DOM Fragment directly at caret selection
  const insertHtmlAtCaret = (html: string) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    selection.deleteFromDocument();
    const range = selection.getRangeAt(0);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const fragment = document.createDocumentFragment();
    let node: ChildNode | null;
    let lastNode: ChildNode | null = null;

    while ((node = tempDiv.firstChild)) {
      lastNode = fragment.appendChild(node);
    }

    range.insertNode(fragment);

    if (lastNode) {
      const newRange = document.createRange();
      newRange.setStartAfter(lastNode);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
  };

  // --- Robust Caret Deletion and Navigation Handling ---
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;

    // Handle Backspace
    if (e.key === 'Backspace') {
      // Case 1: Caret is inside a text node, at index 0 (immediately after a node)
      if (container.nodeType === Node.TEXT_NODE && offset === 0) {
        const prev = container.previousSibling as HTMLElement | null;
        if (prev && prev.classList && prev.classList.contains('link-pill')) {
          prev.remove();
          e.preventDefault();
          handleInput();
          return;
        }
      }
      // Case 2: Caret is in the wrapper container directly, right after a node
      else if (container.nodeType === Node.ELEMENT_NODE && offset > 0) {
        const child = container.childNodes[offset - 1] as HTMLElement | null;
        if (child && child.classList && child.classList.contains('link-pill')) {
          child.remove();
          e.preventDefault();
          handleInput();
          return;
        }
      }
    }

    // Handle Delete
    if (e.key === 'Delete') {
      // Case 1: Caret is inside a text node, at the end of the text node (immediately before next node)
      if (container.nodeType === Node.TEXT_NODE && offset === (container as Text).length) {
        const next = container.nextSibling as HTMLElement | null;
        if (next && next.classList && next.classList.contains('link-pill')) {
          next.remove();
          e.preventDefault();
          handleInput();
          return;
        }
      }
      // Case 2: Caret is in the wrapper container directly, right before a node
      else if (container.nodeType === Node.ELEMENT_NODE && offset < container.childNodes.length) {
        const child = container.childNodes[offset] as HTMLElement | null;
        if (child && child.classList && child.classList.contains('link-pill')) {
          child.remove();
          e.preventDefault();
          handleInput();
          return;
        }
      }
    }
  };

  /**
   * Imperative API: Allows inserting a link pill manually via a react Ref
   */
  const insertLink = (text: string, url: string) => {
    if (!text || !url) return;
    const cleanUrl = url.trim();
    if (cleanUrl.toLowerCase().startsWith('javascript:')) return;

    if (!editorRef.current) return;
    editorRef.current.focus();

    const pill = document.createElement('span');
    pill.className = 'link-pill';
    pill.setAttribute('contenteditable', 'false');
    pill.setAttribute('data-url', cleanUrl);
    pill.textContent = text;

    const spaceNode = document.createTextNode('\u200B'); // Zero-width space

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    // If focus is outside editor bounds, append pill to editor root
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      editorRef.current.appendChild(pill);
      editorRef.current.appendChild(spaceNode);

      const newRange = document.createRange();
      newRange.setStartAfter(spaceNode);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
      handleInput();
      return;
    }

    range.deleteContents();
    range.insertNode(spaceNode);
    range.insertNode(pill);

    const newRange = document.createRange();
    newRange.setStartAfter(spaceNode);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    handleInput();
  };

  // Expose insertion method on editor ref if requested
  useEffect(() => {
    if (editorRef.current) {
      (editorRef.current as any).insertLink = insertLink;
    }
  }, []);

  return (
    <div className={`rich-text-editor-wrapper ${className}`} style={style}>
      {/* Styles are loaded inline or can be imported. Included here for ease of integration */}
      <style>{`
        .rich-text-editor {
          width: 100%;
          min-height: 120px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 12px;
          color: inherit;
          background: rgba(255, 255, 255, 0.03);
          outline: none;
          line-height: 1.6;
          overflow-y: auto;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .rich-text-editor:focus {
          border-color: #89b4fa;
          box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.15);
        }
        .rich-text-editor[data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: rgba(255, 255, 255, 0.35);
          cursor: text;
        }
        .rich-text-editor .link-pill {
          display: inline-flex;
          align-items: center;
          background-color: rgba(137, 180, 250, 0.15);
          color: #89b4fa;
          border: 1px solid rgba(137, 180, 250, 0.3);
          border-radius: 4px;
          padding: 2px 6px;
          margin: 0 2px;
          font-weight: 500;
          user-select: none;
          -webkit-user-select: none;
          cursor: pointer;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          transition: all 0.2s ease;
        }
        .rich-text-editor .link-pill:hover {
          background-color: rgba(137, 180, 250, 0.25);
          border-color: rgba(137, 180, 250, 0.5);
          box-shadow: 0 0 6px rgba(137, 180, 250, 0.2);
        }
      `}</style>
      
      <div
        ref={editorRef}
        className="rich-text-editor"
        contentEditable
        data-placeholder={placeholder}
        onInput={handleInput}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};
