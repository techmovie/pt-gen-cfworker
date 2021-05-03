import { makeJsonResponse, NONE_EXIST_ERROR, page_parser } from './common';

export async function search_douban_book (query) {
  const douban_search = await fetch(`https://book.douban.com/j/subject_suggest?q=${query}`);
  const douban_search_json = await douban_search.json();

  return makeJsonResponse({
    data: douban_search_json.map(d => {
      return {
        year: d.year,
        subtype: d.type,
        title: d.title,
        subtitle: d.sub_title,
        link: `https://book.douban.com/subject/${d.id}/`,
      };
    }),
  });
}

export async function gen_douban_book (sid) {
  const data = {
    site: 'douban_book',
    sid: sid,
  };

  // 下面开始正常的豆瓣处理流程
  const douban_link = `https://book.douban.com/subject/${sid}/`; // 构造链接
  const db_page_resp = await fetch(douban_link);
  const douban_page_raw = await db_page_resp.text();
  // 对异常进行处理
  if (douban_page_raw.match(/你想访问的页面不存在/)) {
    return makeJsonResponse(Object.assign(data, {
      error: NONE_EXIST_ERROR,
    }));
  } else if (douban_page_raw.match(/检测到有异常请求/)) { // 真的会有这种可能吗？
    return makeJsonResponse(Object.assign(data, {
      error: 'GenHelp was temporary banned by Douban, Please wait....',
    }));
  } else {
    // 解析主页面
    const $ = page_parser(douban_page_raw);

    const title = $('title').text().replace('(豆瓣)', '').trim();

    // 元素获取方法
    const fetch_anchor = function (anchor) {
      if (anchor && anchor[0]) {
        return anchor[0].nextSibling.nodeValue.trim();
      }
      return '';
    };

    // 所有需要的元素
    let poster;
    let origin_title, chinese_title;
    let year, publisher, pager, ISBN;
    let douban_average_rating, douban_votes, douban_rating;
    let catalog, author, translator;
    let tags, author_intro, book_intro;

    data.chinese_title = chinese_title = title;

    const origin_title_anchor = $('#info span.pl:contains("原作名")'); // 原作名

    const publisher_anchor = $('#info span.pl:contains("出版社")'); // 出版社
    const year_anchor = $('#info span.pl:contains("出版年")'); // 出版年
    const isbn_anchor = $('#info span.pl:contains("ISBN")'); // ISBN
    const pager_anchor = $('#info span.pl:contains("页数")'); // 页数

    const book_intro_dom = $('#link-report > span.all.hidden .intro, #link-report .intro').last().find('p');
    const author_intro_dom = $('h2:contains("作者简介") + .indent span.all.hidden .intro,h2:contains("作者简介") + .indent .intro').last().find('p');
    const catalog_dom = $(`#dir_${sid}_full`);
    const tag_dom = $('#db-tags-section .indent a[href^="/tag"]');

    data.author = author = $('#info span.pl:contains("作者")').siblings('a:not([href*="/series"])').map(function () {
      return ($(this).text().trim());
    }).get(); // 作者
    data.translator = translator = $('#info span.pl:contains("译者")').siblings('a').map(function () {
      return ($(this).text().trim());
    }).get(); // 译者
    data.publisher = publisher = fetch_anchor(publisher_anchor);
    data.ISBN = ISBN = fetch_anchor(isbn_anchor);
    data.pager = pager = fetch_anchor(pager_anchor);
    data.origin_title = origin_title = fetch_anchor(origin_title_anchor);
    data.year = year = fetch_anchor(year_anchor).split('-')[0];
    data.poster = $('#mainpic a.nbg').attr('href').replace('img9', 'img1');
    data.book_intro = book_intro = (
      book_intro_dom.length > 0
        ? book_intro_dom.map(function () {
          return $(this).text();
        }).get().join('\n')
        : '暂无相关介绍'
    );
    data.author_intro = author_intro = (
      author_intro_dom.length > 0
        ? author_intro_dom.map(function () {
          return $(this).text();
        }).get().join('\n')
        : '暂无作者相关介绍'
    );
    data.catalog = catalog = (
      catalog_dom.length > 0 ? catalog_dom.text() : ''
    ).split('\n').map(a => a.trim()).filter(a => a.length > 0 && !a.match('收起'));
    data.tags = tags = tag_dom.map(function () {
      return $(this).text();
    }).get();
    data.douban_rating_average = douban_average_rating = $('[property="v:average"]').text().trim();
    data.douban_votes = douban_votes = $('[property="v:votes"]').text();
    data.douban_rating = douban_rating = `${douban_average_rating}/10 from ${douban_votes} users`;
    let descr = poster ? `[img]${poster}[/img]\n\n` : '';
    descr += chinese_title ? `◎书　　名　${chinese_title}\n` : '';
    descr += origin_title ? `◎原　　名　${origin_title}\n` : '';
    descr += pager ? `◎页　　数　${pager}\n` : '';
    descr += author && author.length > 0 ? `◎作　　者　${author}\n` : '';
    descr += translator && translator.length ? `◎译　　者　${translator}\n` : '';
    descr += ISBN ? `◎ISBN　   ${ISBN}\n` : '';
    descr += year ? `◎出版年份　${year}\n` : '';
    descr += publisher ? `◎出版社　　${publisher}\n` : '';
    descr += douban_rating ? `◎豆瓣评分　${douban_rating}\n` : '';
    descr += douban_link ? `◎豆瓣链接　${douban_link}\n` : '';
    descr += tags && tags.length > 0 ? `\n◎标　　签　${tags.join(' | ')}\n` : '';
    descr += book_intro ? `\n◎内容简介\n\n　　${book_intro.replace(/\n/g, '\n' + '　'.repeat(2))}\n` : '';
    descr += author_intro ? `\n◎作者简介\n\n　　${author_intro.replace(/\n/g, '\n' + '　'.repeat(2))}\n` : '';
    descr += catalog && catalog.length > 0 ? `\n◎目　　录　${catalog.join('\n' + '　'.repeat(4) + '  　').trim()}\n` : '';

    data.format = descr.trim();
    data.success = true; // 更新状态为成功

    return makeJsonResponse(data);
  }
}
