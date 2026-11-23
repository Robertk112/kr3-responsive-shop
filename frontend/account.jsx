import React, { useEffect, useState } from 'react';
import { currency, quantityLimit, useProducts, useShopState } from './shop-state.js';

const accountURL = 'api/account';
const savedWarning = ' Изменение не сохранится после закрытия страницы.';

function FavoriteList({ products, favorites, toggleFavorite, onChange }) {
  const items = products.filter((product) => favorites.has(product.id));
  return (
    <section className="shop-panel" aria-labelledby="favorites-title">
      <h2 id="favorites-title" tabIndex="-1">Избранные товары</h2>
      {items.length ? (
        <ul className="shop-items">
          {items.map(({ id, name, href, image, price }) => (
            <li className="shop-item" key={id}>
              <img src={image} alt="" width="96" height="64" />
              <div>
                <a href={href || 'catalog.html#' + id}>{name}</a>
                <p>{currency.format(price)}</p>
              </div>
              <button type="button" className="button button--secondary"
                aria-label={'Убрать из избранного: ' + name} onClick={(event) => {
                  const panel = event.currentTarget.closest('section');
                  const next = event.currentTarget.closest('li').nextElementSibling?.querySelector('button');
                  (next || panel.querySelector('h2')).focus();
                  const { saved } = toggleFavorite(id);
                  onChange(name + ' — товар убран из избранного.' + (saved ? '' : savedWarning));
                }}>Убрать</button>
            </li>
          ))}
        </ul>
      ) : <p>Пока здесь пусто. Добавь товары в избранное из <a href="catalog.html">каталога</a>.</p>}
    </section>
  );
}

function AccountForm({ mode, pending, onSubmit }) {
  const registering = mode === 'register';
  const prefix = registering ? 'register' : 'login';
  return (
    <form className="order-form shop-auth-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit(mode, Object.fromEntries(new FormData(event.currentTarget)));
    }}>
      {registering && <div>
        <label className="order-form__label" htmlFor={prefix + '-name'}>Имя</label>
        <input className="order-form__input" id={prefix + '-name'} name="name" autoComplete="name" minLength="2" maxLength="80" required />
      </div>}
      <div>
        <label className="order-form__label" htmlFor={prefix + '-email'}>E-mail</label>
        <input className="order-form__input" id={prefix + '-email'} name="email" type="email"
          autoComplete="username" maxLength="254" required />
      </div>
      <div>
        <label className="order-form__label" htmlFor={prefix + '-password'}>Пароль</label>
        <input className="order-form__input" id={prefix + '-password'} name="password" type="password"
          autoComplete={registering ? 'new-password' : 'current-password'} maxLength="128"
          minLength={registering ? 8 : undefined} aria-describedby={registering ? 'register-password-hint' : undefined} required />
        {registering && <small className="order-form__hint" id="register-password-hint">Не менее 8 символов.</small>}
      </div>
      <button className="button button--primary" disabled={pending} type="submit">{registering ? 'Зарегистрироваться' : 'Войти'}</button>
    </form>
  );
}

export function Account() {
  const products = useProducts();
  const { cart, favorites, toggleFavorite } = useShopState();
  const [user, setUser] = useState(null);
  const [availability, setAvailability] = useState('loading');
  const [mode, setMode] = useState('login');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (location.protocol === 'file:' || location.hostname.endsWith('.github.io')) {
      setAvailability('static');
      return;
    }
    const controller = new AbortController();
    fetch(accountURL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          throw new Error('Account API unavailable');
        }
        const data = await response.json();
        setUser(data.user);
        setAvailability('available');
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setAvailability('static');
      });
    return () => controller.abort();
  }, []);

  async function submit(action, values) {
    setPending(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(accountURL + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: values === undefined ? undefined : JSON.stringify(values)
      });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        setError(result?.error || 'Не удалось выполнить действие.');
        return;
      }
      setUser(result);
      setStatus(action === 'logout' ? 'Вы вышли из аккаунта.' : 'Вход выполнен.');
    } catch {
      setError('Сервер недоступен. Проверьте подключение и повторите попытку.');
    } finally {
      setPending(false);
    }
  }

  const itemCount = products.reduce((sum, product) => sum + (cart[product.id] || 0), 0);
  return (
    <>
      <section className="shop-panel" aria-labelledby="account-title">
        <h2 id="account-title">{user ? 'Профиль' : 'Аккаунт'}</h2>
        <p className="shop-announcement" role="status">{status}</p>
        <p className="order-form__error shop-announcement" role="alert">{error}</p>
        {availability === 'loading' && <p>Проверяем вход…</p>}
        {availability === 'static' && <p>Регистрация и вход доступны при запуске сайта через Go-сервер. В этой версии можно пользоваться избранным и корзиной.</p>}
        {availability === 'available' && (user ? (
          <div className="shop-profile">
            <dl><dt>Имя</dt><dd>{user.name}</dd><dt>E-mail</dt><dd>{user.email}</dd></dl>
            <button type="button" className="button button--secondary" disabled={pending} onClick={() => submit('logout')}>Выйти</button>
          </div>
        ) : (
          <>
            <div className="shop-actions">
              <button type="button" className="button button--secondary" aria-pressed={mode === 'login'} disabled={pending}
                onClick={() => { setMode('login'); setError(''); }}>Вход</button>
              <button type="button" className="button button--secondary" aria-pressed={mode === 'register'} disabled={pending}
                onClick={() => { setMode('register'); setError(''); }}>Регистрация</button>
            </div>
            <AccountForm key={mode} mode={mode} pending={pending} onSubmit={submit} />
          </>
        ))}
        <p><a href="cart.html">Корзина ({itemCount})</a></p>
      </section>
      <FavoriteList products={products} favorites={favorites} toggleFavorite={toggleFavorite}
        onChange={(text) => setStatus(text)} />
    </>
  );
}

export function Cart() {
  const products = useProducts();
  const { cart, setQuantity } = useShopState();
  const [status, setStatus] = useState('');
  const items = products.filter((product) => cart[product.id]);
  const total = items.reduce((sum, item) => sum + item.price * cart[item.id], 0);
  const quantity = items.reduce((sum, item) => sum + cart[item.id], 0);

  function change(item, amount, action) {
    const saved = setQuantity(item.id, amount);
    setStatus(action + (saved ? '' : savedWarning));
  }

  return (
    <section className="shop-panel" aria-labelledby="cart-title">
      <h2 id="cart-title" tabIndex="-1">Товары в корзине</h2>
      <p className="shop-announcement" role="status">{status}</p>
      {items.length ? (
        <>
          <ul className="shop-items">
            {items.map((item) => {
              const amount = cart[item.id];
              return (
                <li className="shop-item" key={item.id}>
                  <img src={item.image} alt="" width="96" height="64" />
                  <div>
                    <a href={item.href || 'catalog.html#' + item.id}>{item.name}</a>
                    <p>{currency.format(item.price)} за единицу</p>
                  </div>
                  <div className="shop-quantity">
                    <button type="button" className="button button--secondary" disabled={amount === 1}
                      aria-label={'Уменьшить количество: ' + item.name}
                      onClick={() => change(item, amount - 1, 'Количество уменьшено.')}>−</button>
                    <output aria-label={'Количество: ' + item.name}>{amount}</output>
                    <button type="button" className="button button--secondary" disabled={amount === quantityLimit}
                      aria-label={'Увеличить количество: ' + item.name}
                      onClick={() => change(item, amount + 1, 'Количество увеличено.')}>+</button>
                  </div>
                  <strong>{currency.format(item.price * amount)}</strong>
                  <button type="button" className="button button--secondary"
                    aria-label={'Удалить из корзины: ' + item.name} onClick={(event) => {
                      const next = event.currentTarget.closest('li').nextElementSibling?.querySelector('a');
                      (next || document.getElementById('cart-title')).focus();
                      change(item, 0, 'Товар удалён из корзины.');
                    }}>Удалить</button>
                </li>
              );
            })}
          </ul>
          <p className="shop-total" role="status">Всего товаров: {quantity}. Итого <strong>{currency.format(total)}</strong></p>
        </>
      ) : <p>Корзина пуста. Выбери товары в <a href="catalog.html">каталоге</a>.</p>}
    </section>
  );
}
