import { makeJsonResponse, AUTHOR } from './lib/common';
import debug_get_err from './lib/error';

import { search_douban, gen_douban } from './lib/douban';
import { search_douban_book, gen_douban_book } from './lib/douban_book';
import { search_imdb, gen_imdb } from './lib/imdb';
import { search_bangumi, gen_bangumi } from './lib/bangumi';
import { gen_steam } from './lib/steam';
import { gen_indienova } from './lib/indienova';
import { gen_epic } from './lib/epic';

/**
 * Cloudflare Worker entrypoint
 */
addEventListener('fetch', event => {
  event.respondWith(handle(event));
});
const support_list = {
  // 注意value值中正则的分组只能有一个，而且必须是sid信息，其他分组必须设置不捕获属性
  douban_movie: /(?:https?:\/\/)?(?:(?:movie|www)\.)douban\.com\/(?:subject|movie)\/(\d+)\/?/,
  douban_book: /(?:https?:\/\/)?(?:(?:book|www)\.)douban\.com\/(?:subject|book)\/(\d+)\/?/,
  imdb: /(?:https?:\/\/)?(?:www\.)?imdb\.com\/title\/(tt\d+)\/?/,
  bangumi: /(?:https?:\/\/)?(?:bgm\.tv|bangumi\.tv|chii\.in)\/subject\/(\d+)\/?/,
  steam: /(?:https?:\/\/)?(?:store\.)?steam(?:powered|community)\.com\/app\/(\d+)\/?/,
  indienova: /(?:https?:\/\/)?indienova\.com\/game\/(\S+)/,
  epic: /(?:https?:\/\/)?www\.epicgames\.com\/store\/[a-zA-Z-]+\/product\/(\S+)\/\S?/,
};

const support_site_list = Object.keys(support_list);

/**
 * Fetch and log a request
 * @param {Event} event
 */
async function handle (event) {
  const request = event.request; // 获取请求

  // 处理OPTIONS
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  // 检查缓存，命中则直接返回
  const cache = caches.default; // 定义缓存
  let response = await cache.match(request);

  if (!response) { // 未命中缓存
    // 使用URI() 解析request.url
    const uri = new URL(request.url);
    try {
      // 不存在任何请求字段，且在根目录，返回默认页面（HTML）
      if (uri.pathname === '/' && uri.search === '') {
        response = await makeIndexResponse();
      } else if (uri.searchParams.get('search')) { // 其他的请求均应视为ajax请求，返回JSON
        // 搜索类（通过PT-Gen代理）
        const keywords = uri.searchParams.get('search');
        const source = uri.searchParams.get('source') || 'douban';
        if (support_site_list.includes(source)) {
          if (source === 'douban') {
            response = await search_douban(keywords);
          } if (source === 'douban_book') {
            response = await search_douban_book(keywords);
          } else if (source === 'imdb') {
            response = await search_imdb(keywords);
          } else if (source === 'bangumi') {
            response = await search_bangumi(keywords);
          } else {
            // 没有对应方法搜索的资源站点
            response = makeJsonResponse({
              error: 'Miss search function for `source`: ' + source + '.',
            });
          }
        } else {
          response = makeJsonResponse({
            error: 'Unknown value of key `source`.',
          });
        }
      } else {
        // 内容生成类
        let site, sid;

        // 请求字段 `&url=` 存在
        if (uri.searchParams.get('url')) {
          const url_ = uri.searchParams.get('url');
          for (const site_ in support_list) {
            const pattern = support_list[site_];
            if (url_.match(pattern)) {
              site = site_;
              sid = url_.match(pattern)[1];
              break;
            }
          }
        } else {
          site = uri.searchParams.get('site');
          sid = uri.searchParams.get('sid');
        }

        // 如果site和sid不存在的话，提前返回
        if (site == null || sid == null) {
          response = makeJsonResponse({
            error: 'Miss key of `site` or `sid` , or input unsupported resource `url`.',
          });
        } else {
          if (support_site_list.includes(site)) {
            // 进入对应资源站点处理流程
            if (site === 'douban_movie') {
              response = await gen_douban(sid);
            } else if (site === 'douban_book') {
              response = await gen_douban_book(sid);
            } else if (site === 'imdb') {
              response = await gen_imdb(sid);
            } else if (site === 'bangumi') {
              response = await gen_bangumi(sid);
            } else if (site === 'steam') {
              response = await gen_steam(sid);
            } else if (site === 'indienova') {
              response = await gen_indienova(sid);
            } else if (site === 'epic') {
              response = await gen_epic(sid);
            } else {
              // 没有对应方法的资源站点，（真的会有这种情况吗？
              response = makeJsonResponse({
                error: 'Miss generate function for `site`: ' + site + '.',
              });
            }
          } else {
            response = makeJsonResponse({
              error: 'Unknown value of key `site`.',
            });
          }
        }
      }

      // 添加缓存，此处如果response如果为undefined的话会抛出错误
      event.waitUntil(cache.put(request, response.clone()));
    } catch (e) {
      const err_return = {
        error: `Internal Error, Please contact @${AUTHOR}. Exception: ${e.message}`,
      };

      if (uri.searchParams.get('debug') === '1') {
        err_return.debug = debug_get_err(e, request);
      }

      response = makeJsonResponse(err_return);
      // 当发生Internal Error的时候不应该进行cache
    }
  }

  return response;
}

// -    辅助方法      -//
function handleOptions (request) {
  if (request.headers.get('Origin') !== null &&
    request.headers.get('Access-Control-Request-Method') !== null &&
    request.headers.get('Access-Control-Request-Headers') !== null) {
    // Handle CORS pre-flight request.
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': 'Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers',
      },
    });
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        Allow: 'GET, HEAD, OPTIONS',
      },
    });
  }
}

async function makeIndexResponse () {
  return new Response(INDEX, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

const INDEX = `
INDEX_HTML_REPLACE
`;
