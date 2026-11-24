import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { currency, quantityLimit, useProducts, useShopState } from './shop-state.js';

const accountURL = 'api/account';
const savedWarning = ' Изменение не сохранится после закрытия страницы.';

export function CartQuantity({ name, amount, onChange }) {
  const firstButton = useRef(null);
  const restoreFocus = useRef(false);

  useLayoutEffect(() => {
    if (restoreFocus.current) {
      firstButton.current.focus();
      restoreFocus.current = false;
    }
  }, [amount]);

  function change(nextAmount, event) {
    restoreFocus.current = (amount === 0 || nextAmount === 0) && document.activeElement === event.currentTarget;
    onChange(nextAmount);
  }

  if (!amount) {
    return <button ref={firstButton} type="button" className="button button--secondary product-cart-add"
      aria-label={'В корзину: ' + name} onClick={(event) => change(1, event)}>В корзину</button>;
  }

  return (
    <div className="product-cart-quantity" role="group" aria-label={'Количество в корзине: ' + name}>
      <button ref={firstButton} type="button" aria-label={'Уменьшить количество: ' + name}
        onClick={(event) => change(amount - 1, event)}>−</button>
      <span className="product-cart-quantity__value"><strong>{amount}</strong> в корзине</span>
      <button type="button" aria-label={'Увеличить количество: ' + name} aria-disabled={amount >= quantityLimit}
        onClick={(event) => { if (amount < quantityLimit) change(amount + 1, event); }}>+</button>
    </div>
  );
}

function FavoriteList({ products, favorites, toggleFavorite, cart, setQuantity }) {
  const [status, setStatus] = useState('');
  const items = products.filter((product) => favorites.has(product.id));
  return (
    <section className="shop-panel" aria-labelledby="favorites-title">
      <div className="shop-profile__header">
        <h2 id="favorites-title" tabIndex="-1">Избранные товары</h2>
        {items.length > 0 && <span className="shop-count" aria-label={'Товаров в избранном: ' + items.length}>{items.length}</span>}
      </div>
      <p className="shop-announcement" role="status">{status}</p>
      {items.length ? (
        <ul className="shop-items">
          {items.map(({ id, name, href, image, price }) => (
            <li className="shop-item favorite-item" key={id}>
              <div className="favorite-item__product">
                <img src={image} alt="" width="96" height="64" loading="lazy" />
                <div>
                  <a href={href || 'catalog.html#' + id}>{name}</a>
                  <p>{currency.format(price)}</p>
                </div>
              </div>
              <div className="favorite-item__cart">
                <CartQuantity name={name} amount={cart[id] || 0} onChange={(amount) => {
                  const saved = setQuantity(id, amount);
                  setStatus(saved ? '' : 'Количество обновлено.' + savedWarning);
                }} />
              </div>
              <button type="button" className="button button--secondary favorite-item__remove"
                aria-label={'Убрать из избранного: ' + name} onClick={(event) => {
                  const panel = event.currentTarget.closest('section');
                  const next = event.currentTarget.closest('li').nextElementSibling?.querySelector('.favorite-item__remove');
                  (next || panel.querySelector('h2')).focus();
                  const { saved } = toggleFavorite(id);
                  setStatus(name + ' — товар убран из избранного.' + (saved ? '' : savedWarning));
                }}>Убрать</button>
            </li>
          ))}
        </ul>
      ) : <p className="shop-favorites__empty">Добавляйте понравившиеся товары в избранное из <a href="catalog.html">каталога</a>.</p>}
    </section>
  );
}

function AccountForm({ mode, pending, onSubmit }) {
  const registering = mode === 'register';
  const prefix = registering ? 'register' : 'login';
  const requiredMark = registering && <span aria-hidden="true"> *</span>;
  return (
    <form className="order-form shop-auth-form" onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const values = Object.fromEntries(formData);
      if (registering) values.personalDataConsent = formData.has('personalDataConsent');
      onSubmit(mode, values);
    }}>
      {registering && <div>
        <label className="order-form__label" htmlFor={prefix + '-name'}>Имя{requiredMark}</label>
        <input className="order-form__input" id={prefix + '-name'} name="name" autoComplete="name" minLength="2" maxLength="80" required />
      </div>}
      <div>
        <label className="order-form__label" htmlFor={prefix + '-email'}>E-mail{requiredMark}</label>
        <input className="order-form__input" id={prefix + '-email'} name="email" type="email"
          autoComplete="username" maxLength="254" required />
      </div>
      {registering && (
        <div>
          <label className="order-form__label" htmlFor="register-phone">Номер телефона{requiredMark}</label>
          <input className="order-form__input" id="register-phone" name="phone" type="tel" autoComplete="tel"
            placeholder="+7 (900) 000-00-00" maxLength="32" required />
        </div>
      )}
      <div>
        <label className="order-form__label" htmlFor={prefix + '-password'}>Пароль{requiredMark}</label>
        <input className="order-form__input" id={prefix + '-password'} name="password" type="password"
          autoComplete={registering ? 'new-password' : 'current-password'} maxLength="128"
          minLength={registering ? 8 : undefined} aria-describedby={registering ? 'register-password-hint' : undefined} required />
        {registering && <small className="order-form__hint" id="register-password-hint">Не менее 8 символов.</small>}
      </div>
      {registering && (
        <label className="shop-auth-form__consent">
          <input type="checkbox" name="personalDataConsent" required />
          <span>Я даю согласие на обработку персональных данных для регистрации и работы личного кабинета.{requiredMark}</span>
        </label>
      )}
      <button className="button button--primary" disabled={pending} type="submit">{registering ? 'Зарегистрироваться' : 'Войти'}</button>
    </form>
  );
}

export function useAccountSession() {
  const [user, setUser] = useState(null);
  const [availability, setAvailability] = useState('loading');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const sessionCheck = useRef(null);

  const refresh = useCallback(async () => {
    sessionCheck.current?.abort();
    if (location.protocol === 'file:' || location.hostname.endsWith('.github.io')) {
      setUser(null);
      setAvailability('static');
      return null;
    }
    const controller = new AbortController();
    sessionCheck.current = controller;
    try {
      const response = await fetch(accountURL, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Account API unavailable');
      }
      const { user: currentUser } = await response.json();
      if (controller.signal.aborted) return null;
      setUser(currentUser);
      setAvailability('available');
      return currentUser;
    } catch {
      if (!controller.signal.aborted) {
        setUser(null);
        setAvailability('unavailable');
      }
      return null;
    } finally {
      if (sessionCheck.current === controller) sessionCheck.current = null;
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => sessionCheck.current?.abort();
  }, [refresh]);

  async function submit(action, values) {
    setPending(true);
    setError('');
    try {
      const response = await fetch(accountURL + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: values === undefined ? undefined : JSON.stringify(values)
      });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        setError(result?.error || 'Не удалось выполнить действие.');
        return false;
      }
      sessionCheck.current?.abort();
      setUser(result);
      return true;
    } catch {
      setError('Сервер недоступен. Проверьте подключение и повторите попытку.');
      return false;
    } finally {
      setPending(false);
    }
  }

  return { user, availability, pending, error, refresh, submit, clearError: () => setError('') };
}

function AccountAccess({ session, onSuccess }) {
  const { availability, pending, error, clearError, submit, refresh } = session;
  const [mode, setMode] = useState('login');

  function chooseMode(nextMode) {
    setMode(nextMode);
    clearError();
  }

  if (availability === 'loading') return <p role="status">Проверяем вход…</p>;
  if (availability === 'static') return <p>Вход и регистрация доступны при запуске сайта через Go-сервер.</p>;
  if (availability === 'unavailable') {
    return (
      <>
        <p role="status">Сервер авторизации недоступен.</p>
        <button type="button" className="button button--secondary" onClick={async () => {
          if (await refresh()) onSuccess?.();
        }}>Повторить проверку</button>
      </>
    );
  }

  return (
    <>
      <div className="shop-actions">
        <button type="button" className="button button--secondary" aria-pressed={mode === 'login'} disabled={pending}
          onClick={() => chooseMode('login')}>Вход</button>
        <button type="button" className="button button--secondary" aria-pressed={mode === 'register'} disabled={pending}
          onClick={() => chooseMode('register')}>Регистрация</button>
      </div>
      <p className="order-form__error shop-announcement" role="alert">{error}</p>
      <AccountForm key={mode} mode={mode} pending={pending} onSubmit={async (action, values) => {
        if (await submit(action, values)) onSuccess?.();
      }} />
    </>
  );
}

export function FavoriteAuthDialog({ dialogRef, session, productId, onClose, onSignedIn }) {
  return (
    <dialog ref={dialogRef} className="shop-auth-dialog" aria-labelledby="favorite-auth-title"
      aria-describedby="favorite-auth-description" onClose={onClose}
      onCancel={(event) => { if (session.pending) event.preventDefault(); }}>
      <div className="shop-auth-dialog__header">
        <h2 id="favorite-auth-title">Вход в личный кабинет</h2>
        <button type="button" className="order-dialog__close" aria-label="Закрыть" disabled={session.pending}
          onClick={() => dialogRef.current.close()}>×</button>
      </div>
      <p id="favorite-auth-description">Войдите или зарегистрируйтесь, чтобы сохранить товар в избранном.</p>
      {productId && <AccountAccess key={productId} session={session} onSuccess={onSignedIn} />}
    </dialog>
  );
}

export function Account() {
  const products = useProducts();
  const { cart, favorites, toggleFavorite, setQuantity } = useShopState();
  const session = useAccountSession();
  const { user, pending, error, submit } = session;
  const breadcrumbs = (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      <ol className="breadcrumbs__list">
        <li><a className="breadcrumbs__link" href="index.html">Главная</a></li>
        <li><span className="breadcrumbs__current" aria-current="page">Личный кабинет</span></li>
      </ol>
    </nav>
  );

  if (!user) {
    return (
      <section className="shop-panel shop-auth-panel" aria-labelledby="account-title">
        {breadcrumbs}
        <h1 id="account-title">Личный кабинет</h1>
        <AccountAccess session={session} />
      </section>
    );
  }

  const itemCount = products.reduce((sum, product) => sum + (cart[product.id] || 0), 0);
  const cartLink = (
    <a className="button button--secondary shop-profile__cart" href="cart.html" aria-label={'Корзина, товаров: ' + itemCount}>
      <span>Корзина</span>
      <span className="shop-count">{itemCount}</span>
    </a>
  );
  return (
    <>
      {breadcrumbs}
      <div className="page-intro">
        <h1>Личный кабинет</h1>
        <p>Профиль и избранные товары.</p>
      </div>
      <section className="shop-panel" id="account-profile" aria-labelledby="account-title">
        <div className="shop-profile__header">
          <h2 id="account-title">Профиль</h2>
        </div>
        <p className="order-form__error shop-announcement" role="alert">{error}</p>
        <div className="shop-profile">
          <dl className="shop-profile__details">
            <div><dt>Имя</dt><dd>{user.name}</dd></div>
            <div><dt>E-mail</dt><dd>{user.email}</dd></div>
            <div><dt>Номер телефона</dt><dd>{user.phone || 'Не указан'}</dd></div>
          </dl>
          <div className="shop-profile__actions">
            {cartLink}
            <button type="button" className="button button--secondary" disabled={pending} onClick={() => submit('logout')}>Выйти</button>
          </div>
        </div>
      </section>
      <FavoriteList products={products} favorites={favorites} toggleFavorite={toggleFavorite} cart={cart} setQuantity={setQuantity} />
    </>
  );
}

export function Cart() {
  const products = useProducts();
  const { cart, setQuantity, clearCart, restoreCart } = useShopState();
  const [status, setStatus] = useState('');
  const [cartBeforeClear, setCartBeforeClear] = useState(null);
  const items = products.filter((product) => cart[product.id]);
  const total = items.reduce((sum, item) => sum + item.price * cart[item.id], 0);
  const quantity = items.reduce((sum, item) => sum + cart[item.id], 0);

  function change(item, amount, action) {
    const saved = setQuantity(item.id, amount);
    setStatus(action + (saved ? '' : savedWarning));
  }

  function emptyCart() {
    const { previousCart, saved } = clearCart();
    setCartBeforeClear(previousCart);
    document.getElementById('cart-title').focus();
    setStatus('Корзина очищена.' + (saved ? '' : savedWarning));
  }

  function undoClear() {
    const saved = restoreCart(cartBeforeClear);
    document.getElementById('cart-title').focus();
    setCartBeforeClear(null);
    setStatus('Товары возвращены в корзину.' + (saved ? '' : savedWarning));
  }

  return (
    <section className="shop-panel" aria-labelledby="cart-title">
      <h2 id="cart-title" tabIndex="-1">Товары в корзине</h2>
      <div className={cartBeforeClear ? 'cart-undo' : undefined}>
        <p className="shop-announcement" role="status">{status}</p>
        {cartBeforeClear && (
          <button type="button" className="button button--secondary" onClick={undoClear}>Отменить очистку</button>
        )}
      </div>
      {items.length ? (
        <>
          <ul className="shop-items">
            {items.map((item) => {
              const amount = cart[item.id];
              return (
                <li className="shop-item cart-item" key={item.id}>
                  <div className="cart-item__product">
                    <img src={item.image} alt="" width="96" height="64" />
                    <div>
                      <a href={item.href || 'catalog.html#' + item.id}>{item.name}</a>
                      <p>{currency.format(item.price)} за единицу</p>
                    </div>
                  </div>
                  <strong className="cart-item__subtotal">{currency.format(item.price * amount)}</strong>
                  <div className="shop-quantity">
                    <button type="button" className="button button--secondary" disabled={amount === 1}
                      aria-label={'Уменьшить количество: ' + item.name}
                      onClick={() => change(item, amount - 1, 'Количество уменьшено.')}>−</button>
                    <output aria-label={'Количество: ' + item.name}>{amount}</output>
                    <button type="button" className="button button--secondary" disabled={amount === quantityLimit}
                      aria-label={'Увеличить количество: ' + item.name}
                      onClick={() => change(item, amount + 1, 'Количество увеличено.')}>+</button>
                  </div>
                  <button type="button" className="button button--secondary cart-item__remove"
                    aria-label={'Удалить из корзины: ' + item.name} onClick={(event) => {
                      const next = event.currentTarget.closest('li').nextElementSibling?.querySelector('a');
                      (next || document.getElementById('cart-title')).focus();
                      change(item, 0, 'Товар удалён из корзины.');
                    }}>Удалить</button>
                </li>
              );
            })}
          </ul>
          <div className="shop-actions cart-checkout">
            <p className="shop-total" role="status">Всего товаров: {quantity}. Итого <strong>{currency.format(total)}</strong></p>
            <div className="shop-actions">
              <button type="button" className="button button--secondary" onClick={emptyCart}>Очистить корзину</button>
              <button type="button" className="button button--primary" aria-haspopup="dialog"
                data-order={JSON.stringify({
                  items: items.map((item) => ({ name: item.name, quantity: cart[item.id] })),
                  total
                })}>Заказать</button>
            </div>
          </div>
        </>
      ) : <p>Корзина пуста. Выбери товары в <a href="catalog.html">каталоге</a>.</p>}
    </section>
  );
}
