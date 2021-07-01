import { makeJsonResponse, NONE_EXIST_ERROR, page_parser } from './common';

function getNumberFromString (raw) {
  return (raw.match(/[\d,]+/) || ['0'])[0].replace(/,/g, '');
}

export async function search_imdb (query) {
  query = query.toLowerCase(); // 大写字母须转成小写
  const imdb_search = await fetch(`https://v2.sg.media-imdb.com/suggestion/${query.slice(0, 1)}/${query}.json`);
  const imdb_search_json = await imdb_search.json();
  return makeJsonResponse({
    data: (imdb_search_json.d || []).filter(d => {
      return /^tt/.test(d.id);
    }).map(d => {
      return {
        year: d.y,
        subtype: d.q,
        title: d.l,
        link: `https://www.imdb.com/title/${d.id}`,
      };
    }),
  });
}

export async function gen_imdb (sid) {
  const data = {
    site: 'imdb',
    sid: sid,
  };
  // 处理imdb_id tt\d{7,8} 或者 \d{0,8}
  if (sid.startsWith('tt')) {
    sid = sid.slice(2);
  }

  // 不足7位补齐到7位，如果是7、8位则直接使用
  const imdb_id = 'tt' + sid.padStart(7, '0');
  const imdb_url = `https://www.imdb.com/title/${imdb_id}/`;

  const imdb_page_resp = await fetch(imdb_url);
  const imdb_page_raw = await imdb_page_resp.text();

  if (imdb_page_raw.match(/404 Error - IMDb/)) {
    return makeJsonResponse(Object.assign(data, {
      error: NONE_EXIST_ERROR,
    }));
  }

  const imdb_release_info_page_req = fetch(`${imdb_url}releaseinfo`);

  const $ = page_parser(imdb_page_raw);

  // 首先解析页面中的json信息，并从中获取数据  `<script type="application/ld+json">...</script>`
  const page_json = JSON.parse($('script[type="application/ld+json"]').html().replace(/\n/ig, ''));

  data.imdb_id = imdb_id;
  data.imdb_link = imdb_url;

  // 处理可以直接从page_json中复制过来的信息
  const copy_items = ['@type', 'name', 'genre', 'contentRating', 'datePublished', 'duration'];
  for (let i = 0; i < copy_items.length; i++) {
    const copy_item = copy_items[i];
    data[copy_item] = page_json[copy_item];
  }

  data.poster = page_json.image;

  if (data.datePublished) {
    data.year = data.datePublished.slice(0, 4);
  }

  const person_items = ['actor', 'director', 'creator'];
  for (let i = 0; i < person_items.length; i++) {
    const person_item = person_items[i];
    let raw = page_json[person_item];

    if (!raw) continue; // 没有对应直接直接进入下一轮

    // 有时候这个可能为一个dict而不是dict array
    if (!Array.isArray(raw)) {
      raw = [raw];
    }

    // 只要人的（Person），不要组织的（Organization）
    const item_persons = raw.filter((d) => {
      return d['@type'] === 'Person';
    });

    if (item_persons.length > 0) {
      data[person_item + 's'] = item_persons.map((d) => {
        delete d['@type'];
        return d;
      });
    }
  }

  data.keywords = 'keywords' in page_json ? page_json.keywords.split(',') : [];
  const aggregate_rating = page_json.aggregateRating || {};

  data.imdb_votes = aggregate_rating.ratingCount || 0;
  data.imdb_rating_average = aggregate_rating.ratingValue || 0;
  data.imdb_rating = `${data.imdb_rating_average}/10 from ${data.imdb_votes} users`;

  // 解析页面元素
  // 第一部分： Metascore，Reviews，Popularity
  const mrp_bar = $('div.titleReviewBar > div.titleReviewBarItem');
  mrp_bar.each(function () {
    const that = $(this);
    if (that.text().match(/Metascore/)) {
      const metascore_another = that.find('div.metacriticScore');
      if (metascore_another) data.metascore = metascore_another.text().trim();
    } else if (that.text().match(/Reviews/)) {
      const reviews_another = that.find('a[href^=reviews]');
      const critic_another = that.find('a[href^=externalreviews]');
      if (reviews_another) data.reviews = getNumberFromString(reviews_another.text());
      if (critic_another) data.critic = getNumberFromString(critic_another.text());
    } else if (that.text().match(/Popularity/)) {
      data.popularity = getNumberFromString(that.text());
    }
  });

  // 第二部分： Details
  const details_another = $('div[data-testid="title-details-section"]');
  const title_anothers = details_another.find('li.ipc-metadata-list__item');
  const details_dict = {};
  title_anothers.each(function () {
    const title_raw = $(this).find('.ipc-metadata-list-item__content-container').text().replace(/\n/ig, ' ').replace(/See more »|Show more on {3}IMDbPro »/g, '').trim();
    if (title_raw.length > 0) {
      const title_key = $(this).find('.ipc-metadata-list-item__label').text();
      details_dict[title_key] = title_raw.replace(/ {2,}/g, ' ').trim();
    }
  });
  data.details = details_dict;

  // 请求附属信息
  // 第一部分： releaseinfo
  const imdb_release_info_page_resp = await imdb_release_info_page_req;
  const imdb_release_info_raw = await imdb_release_info_page_resp.text();
  const imdb_release_info = page_parser(imdb_release_info_raw);

  const release_date_items = imdb_release_info('tr.release-date-item');
  const release_date = [];
  const aka = [];
  release_date_items.each(function () {
    const that = imdb_release_info(this); // $(this) ?
    const country = that.find('td.release-date-item__country-name');
    const date = that.find('td.release-date-item__date');

    if (country && date) {
      release_date.push({
        country: country.text().trim(),
        date: date.text().trim(),
      });
    }
  });
  data.release_date = release_date;

  const aka_items = imdb_release_info('tr.aka-item');
  aka_items.each(function () {
    const that = imdb_release_info(this);
    const country = that.find('td.aka-item__name');
    const title = that.find('td.aka-item__title');

    if (country && title) {
      aka.push({
        country: country.text().trim(),
        title: title.text().trim(),
      });
    }
  });
  data.aka = aka;

  const storyLine = $('[data-testid="storyline-plot-summary"]>div div');
  data.description = storyLine.text().replace(/^\s+|\s+$/g, '');
  // 生成format
  let descr = (data.poster && data.poster.length > 0) ? `[img]${data.poster}[/img]\n\n` : '';
  descr += (data.name && data.name.length > 0) ? `Title: ${data.name}\n` : '';
  descr += (data.keywords && data.keywords.length > 0) ? `Keywords: ${data.keywords.join(', ')}\n` : '';
  descr += (data.datePublished && data.datePublished.length > 0) ? `Date Published: ${data.datePublished}\n` : '';
  descr += (data.imdb_rating && data.imdb_rating.length > 0) ? `IMDb Rating: ${data.imdb_rating}\n` : '';
  descr += (data.imdb_link && data.imdb_link.length > 0) ? `IMDb Link: ${data.imdb_link}\n` : '';
  descr += (data.directors && data.directors.length > 0) ? `Directors: ${data.directors.map(i => i.name).join(' / ')}\n` : '';
  descr += (data.creators && data.creators.length > 0) ? `Creators: ${data.creators.map(i => i.name).join(' / ')}\n` : '';
  descr += (data.actors && data.actors.length > 0) ? `Actors: ${data.actors.map(i => i.name).join(' / ')}\n` : '';
  descr += (data.description && data.description.length > 0) ? `\nIntroduction\n    ${data.description.replace(/\n/g, '\n' + '　'.repeat(2))}\n` : '';

  data.format = descr.trim();
  data.success = true; // 更新状态为成功
  return makeJsonResponse(data);
}
