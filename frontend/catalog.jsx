import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Account, Cart } from './account.jsx';
import { currency, quantityLimit, useProducts, useShopState } from './shop-state.js';

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

function CatalogFilters({ filters, onChange, onReset, favoriteFilter, invalidRange }) {
  function changeCategory(value, checked) {
    onChange('categories', checked
      ? [...filters.categories, value]
      : filters.categories.filter((category) => category !== value));
  }

  return (
    <aside className="catalog-filters" aria-labelledby="filters-title">
      <h2 className="catalog-filters__title" id="filters-title">Фильтры</h2>
      <form className="filters-form" onSubmit={(event) => event.preventDefault()} onReset={onReset}>
        <div>
          <label className="filters-form__label" htmlFor="catalog-query">Поиск по каталогу</label>
          <input className="filters-form__input" type="search" id="catalog-query" value={filters.query}
            placeholder="Например, арабика" onChange={(event) => onChange('query', event.target.value)} />
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
        <fieldset className="field">
          <legend className="field-title">Категория</legend>
          {Object.entries(categories).map(([key, title]) => (
            <label key={key} className="filters-form__label">
              <input className="choice-input" type="checkbox" name="category" value={key}
                checked={filters.categories.includes(key)} onChange={(event) => changeCategory(key, event.target.checked)} />
              {' '}{title}
            </label>
          ))}
        </fieldset>
        <fieldset className="field">
          <legend className="field-title">Цена, ₽</legend>
          <div className="catalog-price-range">
            <label>От
              <input className="filters-form__input" id="price-from" type="number" min="0"
                value={filters.min} onChange={(event) => onChange('min', event.target.value)} />
            </label>
            <label>До
              <input className="filters-form__input" id="price-to" type="number" min="0"
                value={filters.max} aria-invalid={invalidRange || undefined}
                aria-describedby={invalidRange ? 'price-error' : undefined}
                onChange={(event) => onChange('max', event.target.value)} />
            </label>
          </div>
          {invalidRange && <p className="order-form__error" id="price-error" role="status">Введите неотрицательные цены. Верхняя граница должна быть не ниже нижней.</p>}
        </fieldset>
        <label className="choice-label">
          <input ref={favoriteFilter} type="checkbox" name="favorites" checked={filters.favorites}
            onChange={(event) => onChange('favorites', event.target.checked)} /> Только избранное
        </label>
        <button className="button button--secondary" type="reset">Сбросить фильтры</button>
      </form>
    </aside>
  );
}

function ProductCard({ product, favorite, compared, onFavorite, onCompare, onAdd }) {
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
            <button type="button" className="button button--secondary" data-add-to-cart
              aria-label={'В корзину: ' + name} onClick={() => onAdd(id)}>В корзину</button>
            <button className="button button--secondary" type="button" data-favorite
              aria-label={'В избранное: ' + name} aria-pressed={favorite} onClick={() => onFavorite(id)}>В избранное</button>
            <button className="button button--secondary" type="button" data-compare
              aria-label={'Сравнить: ' + name} aria-pressed={compared} onClick={() => onCompare(id)}>Сравнить</button>
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
  const [filters, setFilters] = useState(emptyFilters);
  const [comparison, setComparison] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const comparisonDialog = useRef(null);
  const favoriteFilter = useRef(null);

  const min = filters.min === '' ? 0 : Number(filters.min);
  const max = filters.max === '' ? Infinity : Number(filters.max);
  const invalidRange = min < 0 || max < 0 || max < min;
  const terms = normalize(filters.query).trim().split(/\s+/).filter(Boolean);
  const shown = invalidRange ? [] : products.filter((product) => {
    const searchText = normalize([product.name, product.description, categories[product.category]].join(' '));
    return terms.every((term) => searchText.includes(term))
      && (!filters.categories.length || filters.categories.includes(product.category))
      && product.price >= min && product.price <= max
      && (!filters.favorites || favorites.has(product.id));
  });
  const sort = sorts[filters.sort];
  if (sort) shown.sort(sort);

  function changeFavorite(id) {
    const { added, saved } = toggleFavorite(id);
    if (!added && filters.favorites) favoriteFilter.current.focus();
    const status = added ? 'Товар добавлен в избранное.' : 'Товар убран из избранного.';
    setAnnouncement(status + (saved ? '' : ' Изменение сохранено только в этой вкладке.'));
  }

  function addToCart(id) {
    const amount = cart[id] || 0;
    if (amount === quantityLimit) {
      setAnnouncement('Достигнут лимит количества для этого товара.');
      return;
    }
    const saved = setQuantity(id, amount + 1);
    setAnnouncement('Товар добавлен в корзину. Количество: ' + (amount + 1) + '.'
      + (saved ? '' : ' Изменение сохранено только в этой вкладке.'));
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
        <CatalogFilters filters={filters} favoriteFilter={favoriteFilter} invalidRange={invalidRange}
          onChange={(field, value) => setFilters({ ...filters, [field]: value })}
          onReset={(event) => { event.preventDefault(); setFilters(emptyFilters); }} />
        <section className="catalog-products" aria-labelledby="catalog-products-title">
          <div className="catalog-products__header">
            <h2 className="section__title" id="catalog-products-title">Список товаров</h2>
            <a href="category-coffee.html" className="button button--secondary">Смотреть кофе в зёрнах</a>
          </div>
          <div className="catalog-toolbar">
            <button className="button button--secondary" id="open-comparison" type="button"
              disabled={comparison.length < 2}
              onClick={() => comparisonDialog.current.showModal()}>Сравнить ({comparison.length}/3)</button>
            <span id="catalog-actions-status" aria-live="polite">{announcement}</span>
          </div>
          <p className="catalog-status" id="catalog-results" role="status">
            {invalidRange ? 'Исправьте диапазон цен.'
              : shown.length ? 'Найдено товаров: ' + shown.length : 'По этим условиям ничего не найдено.'}
          </p>
          <div className="products-grid">
            {shown.map((product) => (
              <ProductCard key={product.id} product={product}
                favorite={favorites.has(product.id)} compared={comparison.includes(product.id)}
                onFavorite={changeFavorite} onCompare={toggleComparison} onAdd={addToCart} />
            ))}
          </div>
        </section>
      </div>
      <ComparisonDialog dialogRef={comparisonDialog}
        products={products.filter((product) => comparison.includes(product.id))} />
    </>
  );
}

function ProductCartButton() {
  const { cart, setQuantity } = useShopState();
  const [status, setStatus] = useState('');
  const amount = cart['item-1'] || 0;
  return (
    <>
      <button className="button button--secondary" type="button" disabled={amount >= quantityLimit}
        onClick={() => {
          const saved = setQuantity('item-1', amount + 1);
          setStatus('Товар добавлен в корзину. Количество: ' + (amount + 1) + '.'
            + (saved ? '' : ' Изменение сохранено только в этой вкладке.'));
        }}>В корзину</button>
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
