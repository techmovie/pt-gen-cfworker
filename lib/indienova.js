import { makeJsonResponse, NONE_EXIST_ERROR, page_parser } from './common';

export async function gen_indienova (sid) {
  const data = {
    site: 'indienova',
    sid: sid,
  };

  const indienova_page_resp = await fetch(`https://indienova.com/game/${sid}`);
  const indienova_page_raw = await indienova_page_resp.text();

  // 检查标题看对应资源是否存在
  if (indienova_page_raw.match(/出现错误/)) {
    return makeJsonResponse(Object.assign(data, {
      error: NONE_EXIST_ERROR,
    }));
  }

  const $ = page_parser(indienova_page_raw);

  data.poster = data.cover = $('div.cover-image img').attr('src'); // 提出封面链接
  data.chinese_title = $('title').text().split('|')[0].split('-')[0].trim(); // 提出标题部分

  const title_field = $('div.title-holder'); // 提取出副标部分
  data.another_title = title_field.find('h1 small') ? title_field.find('h1 small').text().trim() : '';
  data.english_title = title_field.find('h1 span') ? title_field.find('h1 span').text().trim() : '';
  data.release_date = title_field.find('p.gamedb-release').text().trim();

  // 提取链接信息
  const link_field = $('div#tabs-link a.gamedb-link');
  if (link_field.length > 0) {
    const links = {};
    link_field.each(function () {
      const that = $(this);
      const site = that.text().trim();
      links[site] = that.attr('href');
    });
    data.links = links;
  }

  // 提取简介、类型信息
  const intro_field = $('#tabs-intro');
  data.intro = intro_field.find('div.bottommargin-sm').text().trim();

  const tt = intro_field.find('p.single-line');
  if (tt.length > 0) {
    data.intro_detail = tt.map(function () {
      return $(this).text().replace(/[ \n]+/ig, ' ').replace(/,/g, '/').trim();
    }).get();
  }

  // 提取详细介绍 在游戏无详细介绍时用简介代替
  const descr_field = $('article');
  data.descr = descr_field.length > 0 ? descr_field.text().replace('……显示全部', '').trim() : data.intro;

  // 提取评分信息
  const rating_field = $('div#scores text').map(function () {
    return $(this).text();
  }).get();
  data.rate = `${rating_field[0]}:${rating_field[1]} / ${rating_field[2]}:${rating_field[3]}`;

  // 提取制作与发行商
  const pubdev = $('div#tabs-devpub ul[class^="db-companies"]');
  // noinspection JSUnusedLocalSymbols
  data.dev = pubdev.eq(0).text().trim().split('\n').map(function (value, index, array) {
    return value.trim();
  });
  // noinspection JSUnusedLocalSymbols
  data.pub = pubdev.length === 2
    ? pubdev.eq(1).text().trim().split('\n').map(function (value, index, array) {
      return value.trim();
    })
    : [];

  // 提取图片列表
  data.screenshot = $('li.slide img').map(function () {
    return $(this).attr('src');
  }).get();

  // 提取标签信息
  const cat_field = $('div.indienova-tags.gamedb-tags');
  const cat = cat_field ? cat_field.text().trim().split('\n').map(x => x.trim()) : [];
  // 对cat进行去重并移除 "查看全部 +"
  data.cat = cat.filter(function (item, pos) {
    return cat.indexOf(item) === pos && item !== '查看全部 +';
  });

  // 提取分级信息
  const level_field = $('h4:contains("分级") + div.bottommargin-sm');
  data.level = level_field
    ? level_field.find('img').map(function () {
      return $(this).attr('src');
    }).get()
    : [];

  // 提取价格信息
  const price_fields = $('ul.db-stores');
  data.price = price_fields
    ? price_fields.find('li').map(function () {
      const price_field = $(this).find('a > div'); // 里面依次为3个div，分别为 store, platform , price
      const store = price_field.eq(0).text().trim();
      // let platform = price_field.eq(1).text().trim();  // 均为图片，无内容
      const price = price_field.eq(2).text().trim().replace(/[ \n]{2,}/, ' ');
      return `${store}：${price}`;
    }).get()
    : [];

  // 生成format
  let descr = data.cover ? `[img]${data.cover}[/img]\n\n` : '';
  descr += '【基本信息】\n\n'; // 基本信息为原来的baseinfo块
  descr += (data.chinese_title && data.chinese_title.length > 0) ? `中文名称：${data.chinese_title}\n` : '';
  descr += (data.english_title && data.english_title.length > 0) ? `英文名称：${data.english_title}\n` : '';
  descr += (data.another_title && data.another_title.length > 0) ? `其他名称：${data.another_title}\n` : '';
  descr += (data.release_date && data.release_date.length > 0) ? `发行时间：${data.release_date}\n` : '';
  descr += (data.rate && data.rate.length > 0) ? `评分：${data.rate}\n` : '';
  descr += (data.dev && data.dev.length > 0) ? `开发商：${data.dev.join(' / ')}\n` : '';
  descr += (data.pub && data.pub.length > 0) ? `发行商：${data.pub.join(' / ')}\n` : '';
  descr += (data.intro_detail && data.intro_detail.length > 0) ? `${data.intro_detail.join('\n')}\n` : '';
  descr += (data.cat && data.cat.length > 0) ? `标签：${data.cat.slice(0, 8).join(' | ')}\n` : '';
  if ((data.links && data.links.length > 0)) {
    const format_links = [];
    for (const [key, value] of Object.entries(data.links)) {
      format_links.push(`[url=${value}]${key}[/url]`);
    }
    descr += `链接地址：${format_links.join('  ')}\n`;
  }
  descr += (data.price && data.price.length > 0) ? `价格信息：${data.price.join(' / ')}\n` : '';
  descr += '\n';
  descr += (data.descr && data.descr.length > 0) ? `【游戏简介】\n\n${data.descr}\n\n` : '';
  descr += (data.screenshot && data.screenshot.length > 0) ? `【游戏截图】\n\n${data.screenshot.map(x => `[img]${x}[/img]`).join('\n')}\n\n` : '';
  descr += (data.level && data.level.length > 0) ? `【游戏评级】\n\n${data.level.map(x => `[img]${x}[/img]`).join('\n')}\n\n` : '';

  data.format = descr.trim();
  data.success = true; // 更新状态为成功
  return makeJsonResponse(data);
}
