import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safeguard against Google Translate and browser extension DOM mutations crashing React reconciler
if (typeof window !== 'undefined' && typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (!child) return child;
    if (child.parentNode !== this) {
      if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
        try { return child.parentNode.removeChild(child) as T; } catch (e) {}
      }
      return child;
    }
    try {
      return originalRemoveChild.call(this, child) as T;
    } catch (err) {
      if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
        try { return child.parentNode.removeChild(child) as T; } catch (e) {}
      }
      return child;
    }
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (!newNode) return newNode;
    if (referenceNode && referenceNode.parentNode !== this) {
      if (referenceNode.parentNode && typeof referenceNode.parentNode.insertBefore === 'function') {
        try { return referenceNode.parentNode.insertBefore(newNode, referenceNode) as T; } catch (e) {}
      }
      try { return this.appendChild(newNode) as T; } catch (e) { return newNode; }
    }
    try {
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    } catch (err) {
      try { return this.appendChild(newNode) as T; } catch (e) { return newNode; }
    }
  };

  const originalReplaceChild = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function <T extends Node>(newChild: Node, oldChild: T): T {
    if (!newChild || !oldChild) return oldChild;
    if (oldChild.parentNode !== this) {
      if (oldChild.parentNode && typeof oldChild.parentNode.replaceChild === 'function') {
        try { return oldChild.parentNode.replaceChild(newChild, oldChild) as T; } catch (e) {}
      }
      try { return this.appendChild(newChild) as unknown as T; } catch (e) { return oldChild; }
    }
    try {
      return originalReplaceChild.call(this, newChild, oldChild) as T;
    } catch (err) {
      try { return this.appendChild(newChild) as unknown as T; } catch (e) { return oldChild; }
    }
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
