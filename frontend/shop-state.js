import { useEffect, useState } from 'react';
import snapshot from '../api/products.json';

const keys = {
  favorites: 'roastlab.catalog.favorites.v1',
  cart: 'roastlab.cart.v1'
};

export const currency = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', maximumFractionDigits: 0
});
export const quantityLimit = 99;

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function readFavorites() {
  const values = read(keys.favorites, []);
  return new Set(Array.isArray(values) ? values.filter((id) => typeof id === 'string') : []);
}

function readCart() {
  const values = read(keys.cart, {});
  const entries = values && typeof values === 'object' && !Array.isArray(values) ? Object.entries(values) : [];
  return Object.fromEntries(entries.filter(([id, quantity]) =>
    /^item-\d+$/.test(id) && Number.isInteger(quantity) && quantity > 0 && quantity <= quantityLimit
  ));
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function useShopState() {
  const [favorites, setFavorites] = useState(readFavorites);
  const [cart, setCart] = useState(readCart);

  useEffect(() => {
    function refresh({ key }) {
      if (key === null || key === keys.favorites) setFavorites(readFavorites());
      if (key === null || key === keys.cart) setCart(readCart());
    }
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  function toggleFavorite(id) {
    const next = new Set(favorites);
    const added = !next.delete(id);
    if (added) next.add(id);
    setFavorites(next);
    return { added, saved: write(keys.favorites, [...next]) };
  }

  function setQuantity(id, quantity) {
    const next = { ...cart };
    if (quantity <= 0) delete next[id];
    else next[id] = Math.min(quantity, quantityLimit);
    setCart(next);
    return write(keys.cart, next);
  }

  return { favorites, cart, toggleFavorite, setQuantity };
}

export function useProducts() {
  const [products, setProducts] = useState(snapshot);
  useEffect(() => {
    if (location.protocol === 'file:') return;
    const controller = new AbortController();
    fetch('api/products.json', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {
        // Локальный снимок уже показан.
      });
    return () => controller.abort();
  }, []);
  return products;
}
