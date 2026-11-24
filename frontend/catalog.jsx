import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Account, Cart, CartQuantity, FavoriteAuthDialog, useAccountSession } from './account.jsx';
import { currency, useProducts, useShopState } from './shop-state.js';

const categories = {
  beans: 'Кофе в зёрнах',
  ground: 'Молотый кофе',
  makers: 'Кофеварки и френч-прессы',
  grinders: 'Кофемолки',
  accessories: 'Аксессуары'
};

const sorts = {
  'price-up': (a, b) => a.price - b.price,
  'price-down': (a, b) => b.price - a.price,
  name: (a, b) => a.name.localeCompare(b.name, 'ru')
};

const emptyFilters = { query: '', sort: 'default', categories: [], min: '', max: '', favorites: false };
const normalize = (text) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е');
const imageSizes = '(min-width: 1200px) 286px, (min-width: 1024px) 34vw, (min-width: 640px) 47vw, calc(100vw - 64px)';

function CatalogFilters({ filters, onChange, onReset, onShowResults, counts, activeCount, resultCount, invalidRange, signedIn }) {
  const [expanded, setExpanded] = useState(false);

  function changeCategory(value, checked) {
    onChange('categories', checked
      ? [...filters.categories, value]
      : filters.categories.filter((category) => category !== value));
  }

  return (
    <aside className="catalog-filters" aria-labelledby="filters-title">
      <div className="catalog-filters__header">
        <h2 className="catalog-filters__title" id="filters-title">Фильтры</h2>
        {activeCount > 0 && <span className="catalog-filter-count" aria-label={'Активных фильтров: ' + activeCount}>{activeCount}</span>}
        <button className="button button--secondary catalog-filters__toggle" type="button"
          aria-expanded={expanded} aria-controls="catalog-filters-form"
          onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть' : 'Раскрыть'}</button>
      </div>
      <form className="filters-form" id="catalog-filters-form" data-expanded={expanded}
        onSubmit={(event) => event.preventDefault()} onReset={(event) => { event.preventDefault(); onReset(); }}>
        <div>
          <label className="filters-form__label" htmlFor="catalog-query">Поиск по каталогу</label>
          <input className="filters-form__input" type="search" id="catalog-query" value={filters.query}
            placeholder="Например, арабика" autoComplete="off" onChange={(event) => onChange('query', event.target.value)} />
        </div>
        <div>
          <label className="filters-form__label" htmlFor="catalog-sort">Сортировка</label>
          <select className="filters-form__input" id="catalog-sort" value={filters.sort}
            onChange={(event) => onChange('sort', event.target.value)}>
            <option value="default">По умолчанию</option>
            <option value="price-up">Сначала дешевле</option>
            <option value="price-down">Сначала дороже</option>
            <option value="name">По названию</option>
          </select>
        </div>
        <fieldset className="filters-form__group">
          <legend className="filters-form__legend">Категории</legend>
          {Object.entries(categories).map(([key, title]) => (
            <label key={key} className="catalog-filter-option">
              <input className="choice-input" type="checkbox" name="category" value={key}
                checked={filters.categories.includes(key)} onChange={(event) => changeCategory(key, event.target.checked)} />
              <span>{title}</span>
              <span className="catalog-filter-count" aria-hidden="true">{counts[key] || 0}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="filters-form__group">
          <legend className="filters-form__legend">Цена, ₽</legend>
          <div className="catalog-price-range">
            <label>От
              <input className="filters-form__input" id="price-from" type="number" min="0" inputMode="numeric"
                aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? 'price-error' : undefined}
                value={filters.min} onChange={(event) => onChange('min', event.target.value)} />
            </label>
            <label>До
              <input className="filters-form__input" id="price-to" type="number" min="0" inputMode="numeric"
                value={filters.max} aria-invalid={invalidRange || undefined}
                aria-describedby={invalidRange ? 'price-error' : undefined}
                onChange={(event) => onChange('max', event.target.value)} />
            </label>
          </div>
          {invalidRange && <p className="order-form__error" id="price-error" role="status">Введите неотрицательные цены. Верхняя граница должна быть не ниже нижней.</p>}
        </fieldset>
        {signedIn && (
          <label className="catalog-filter-option catalog-filter-option--favorites">
            <input type="checkbox" name="favorites" checked={filters.favorites}
              onChange={(event) => onChange('favorites', event.target.checked)} />
            <span>Только избранное</span>
          </label>
        )}
        <div className="catalog-filters__actions">
          <button className="button button--primary catalog-filters__show" type="button" disabled={invalidRange}
            onClick={() => { setExpanded(false); onShowResults(); }}>К результатам ({resultCount})</button>
          <button className="button button--secondary" type="reset" disabled={!activeCount && filters.sort === 'default'}>Сбросить фильтры</button>
        </div>
      </form>
    </aside>
  );
}

function ProductCard({ product, favorite, compared, amount, onFavorite, onCompare, onQuantity }) {
  const { id, name, category, price, description, image, alt, badge, href } = product;
  return (
    <div className="product-column">
      <article id={id} data-category={category} data-price={price}
        className={'product-card' + (badge === 'Скидка' ? ' product-card--discount' : '')}>
        <img className="product-card__image" src={image}
          srcSet={image.replace('.jpg', '-252.jpg') + ' 252w, ' + image + ' 504w'} sizes={imageSizes}
          alt={alt} width="504" height="333" loading="lazy" />
        <div className="product-card__body">
          <p className="catalog-card-category">{categories[category]}</p>
          {badge && <span className="product-card__badge">{badge}</span>}
          <h3 className="product-card__title">{href ? <a href={href}>{name}</a> : name}</h3>
          <p className="product-card__description">{description}</p>
          <p className="product-card__price">{currency.format(price)}</p>
          <button className="button button--primary" type="button" data-product={name}>Заказать</button>
          <div className="product-tools">
            <CartQuantity name={name} amount={amount} onChange={(nextAmount) => onQuantity(id, nextAmount)} />
            <button className="button button--secondary" type="button" data-compare
              aria-label={name + ': сравнение'} aria-pressed={compared} onClick={() => onCompare(id)}>
              {compared ? 'В сравнении' : 'Сравнить'}
            </button>
            <button className="button button--secondary product-tools__favorite" type="button"
              aria-label={'Избранное: ' + name} title="Избранное" aria-pressed={favorite} onClick={() => onFavorite(id)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20.5 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5Z" />
              </svg>
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

function ComparisonDialog({ dialogRef, products }) {
  return (
    <dialog ref={dialogRef} className="comparison-dialog" id="comparison-dialog" aria-labelledby="comparison-title">
      <header className="comparison-dialog__header">
        <h2 id="comparison-title">Сравнение товаров</h2>
        <form method="dialog"><button className="button button--secondary">Закрыть</button></form>
      </header>
      <div className="comparison-grid" id="comparison-grid">
        {products.map((product) => (
          <article key={product.id}>
            <h3>{product.name}</h3>
            <dl>
              <dt>Цена</dt><dd>{currency.format(product.price)}</dd>
              <dt>Категория</dt><dd>{categories[product.category]}</dd>
              <dt>Описание</dt><dd>{product.description}</dd>
            </dl>
          </article>
        ))}
      </div>
    </dialog>
  );
}

function Catalog() {
  const products = useProducts();
  const { cart, favorites, toggleFavorite, setQuantity } = useShopState();
  const session = useAccountSession();
  const [filters, setFilters] = useState(emptyFilters);
  const [comparison, setComparison] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const [favoritePrompt, setFavoritePrompt] = useState(null);
  const authDialog = useRef(null);
  const checkingFavorite = useRef(false);
  const comparisonDialog = useRef(null);
  const resultsTitle = useRef(null);

  const min = filters.min === '' ? 0 : Number(filters.min);
  const max = filters.max === '' ? Infinity : Number(filters.max);
  const invalidRange = min < 0 || max < 0 || max < min;
  const terms = normalize(filters.query).trim().split(/\s+/).filter(Boolean);
  const filterFavorites = Boolean(session.user && filters.favorites);
  const shown = invalidRange ? [] : products.filter((product) => {
    const searchText = normalize([product.name, product.description, categories[product.category]].join(' '));
    return terms.every((term) => searchText.includes(term))
      && (!filters.categories.length || filters.categories.includes(product.category))
      && product.price >= min && product.price <= max
      && (!filterFavorites || favorites.has(product.id));
  });
  const sort = sorts[filters.sort];
  if (sort) shown.sort(sort);

  const counts = {};
  for (const product of products) {
    counts[product.category] = (counts[product.category] || 0) + 1;
  }

  const activeFilters = filters.categories.map((key) => ({
    key,
    label: categories[key],
    clear: { categories: filters.categories.filter((category) => category !== key) }
  }));
  if (terms.length) activeFilters.unshift({ key: 'query', label: 'Поиск: ' + filters.query.trim(), clear: { query: '' } });
  if (filters.min !== '' || filters.max !== '') {
    const bounds = [filters.min !== '' && 'от ' + filters.min, filters.max !== '' && 'до ' + filters.max].filter(Boolean);
    activeFilters.push({ key: 'price', label: bounds.join(' ') + ' ₽', clear: { min: '', max: '' } });
  }
  if (filterFavorites) activeFilters.push({ key: 'favorites', label: 'Только избранное', clear: { favorites: false } });

  function showResults() {
    resultsTitle.current.focus({ preventScroll: true });
    requestAnimationFrame(() => resultsTitle.current?.scrollIntoView({ block: 'start' }));
  }

  function applyFavorite(id) {
    const { added, saved } = toggleFavorite(id);
    if (!added && filters.favorites) resultsTitle.current.focus({ preventScroll: true });
    const status = added ? 'Товар добавлен в избранное.' : 'Товар убран из избранного.';
    setAnnouncement(status + (saved ? '' : ' Изменение сохранено только в этой вкладке.'));
  }

  async function changeFavorite(id) {
    if (checkingFavorite.current) return;
    checkingFavorite.current = true;
    try {
      if (await session.refresh()) {
        applyFavorite(id);
      } else {
        session.clearError();
        setFavoritePrompt(id);
        authDialog.current?.showModal();
      }
    } finally {
      checkingFavorite.current = false;
    }
  }

  function updateCart(id, amount) {
    const saved = setQuantity(id, amount);
    const status = amount ? 'В корзине: ' + amount + ' шт.' : 'Товар убран из корзины.';
    setAnnouncement(status + (saved ? '' : ' Изменение сохранено только в этой вкладке.'));
  }

  function toggleComparison(id) {
    if (comparison.includes(id)) {
      setComparison(comparison.filter((selected) => selected !== id));
      setAnnouncement('Товар убран из сравнения.');
    } else if (comparison.length < 3) {
      setComparison([...comparison, id]);
      setAnnouncement('Товар выбран для сравнения.');
    } else {
      setAnnouncement('Для сравнения можно выбрать не больше трёх товаров.');
    }
  }

  return (
    <>
      <div className="catalog-layout">
        <CatalogFilters filters={filters} invalidRange={invalidRange} counts={counts} signedIn={Boolean(session.user)}
          activeCount={activeFilters.length} resultCount={shown.length}
          onChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
          onReset={() => setFilters(emptyFilters)} onShowResults={showResults} />
        <section className="catalog-products" aria-labelledby="catalog-products-title">
          <h2 ref={resultsTitle} className="section__title" id="catalog-products-title" tabIndex="-1">Список товаров</h2>
          <div className="catalog-toolbar">
            <a href="category-coffee.html" className="button button--secondary">Кофе в зёрнах</a>
            <button className="button button--secondary" id="open-comparison" type="button"
              disabled={comparison.length < 2}
              onClick={() => comparisonDialog.current.showModal()}>Сравнить ({comparison.length}/3)</button>
          </div>
          <p className="catalog-toolbar__status" id="catalog-actions-status" aria-live="polite">{announcement}</p>
          {activeFilters.length > 0 && (
            <ul className="catalog-active-filters" aria-label="Активные фильтры">
              {activeFilters.map(({ key, label, clear }) => (
                <li key={key}>
                  <button type="button" className="button catalog-filter-chip" aria-label={'Снять фильтр «' + label + '»'}
                    onClick={() => {
                      resultsTitle.current.focus({ preventScroll: true });
                      setFilters((current) => ({ ...current, ...clear }));
                    }}>
                    <span>{label}</span><span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="catalog-status" id="catalog-results" role="status">
            {invalidRange ? 'Исправьте диапазон цен.'
              : shown.length ? 'Найдено товаров: ' + shown.length : 'По этим условиям ничего не найдено.'}
          </p>
          {!shown.length && !invalidRange && activeFilters.length > 0 && (
            <button type="button" className="button button--secondary"
              onClick={() => { setFilters(emptyFilters); showResults(); }}>Сбросить фильтры</button>
          )}
          <div className="products-grid">
            {shown.map((product) => (
              <ProductCard key={product.id} product={product}
                favorite={Boolean(session.user && favorites.has(product.id))} compared={comparison.includes(product.id)}
                amount={cart[product.id] || 0}
                onFavorite={changeFavorite} onCompare={toggleComparison} onQuantity={updateCart} />
            ))}
          </div>
        </section>
      </div>
      <ComparisonDialog dialogRef={comparisonDialog}
        products={products.filter((product) => comparison.includes(product.id))} />
      <FavoriteAuthDialog dialogRef={authDialog} session={session} productId={favoritePrompt}
        onClose={() => setFavoritePrompt(null)} onSignedIn={() => {
          if (!authDialog.current?.open) return;
          if (!favorites.has(favoritePrompt)) applyFavorite(favoritePrompt);
          authDialog.current.close();
        }} />
    </>
  );
}

function ProductCartButton() {
  const { cart, setQuantity } = useShopState();
  const [status, setStatus] = useState('');
  const amount = cart['item-1'] || 0;
  return (
    <>
      <CartQuantity name="Бразилия Серрадо" amount={amount} onChange={(nextAmount) => {
        const saved = setQuantity('item-1', nextAmount);
        const message = nextAmount ? 'В корзине: ' + nextAmount + ' шт.' : 'Товар убран из корзины.';
        setStatus(message + (saved ? '' : ' Изменение сохранено только в этой вкладке.'));
      }} />
      <span className="shop-announcement" role="status">{status}</span>
    </>
  );
}

for (const [id, Component] of [
  ['catalog-app', Catalog],
  ['account-app', Account],
  ['cart-app', Cart],
  ['product-cart', ProductCartButton]
]) {
  const container = document.getElementById(id);
  if (container) createRoot(container).render(<Component />);
}
