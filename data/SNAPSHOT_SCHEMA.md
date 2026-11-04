# Snapshot 数据契约 v2（插件消费）

插件只读 `data/snapshot.json`（运行时可用 `DSH_HOME/plugin-data/dsh-plugin-lol-mayhem/snapshot.json` 覆盖）。
数据由 `scripts/crawl.mjs` 从 aramgg 官方客户端的公开只读 JSON API 生成：`https://data.dtodo.cn/api/client/v1/`。

```jsonc
{
  "schemaVersion": 2,
  "meta": {
    "source": "https://data.dtodo.cn (aramgg 官方客户端数据 API)",
    "locale": "zh-CN",
    "gamePatch": "16.21",
    "dataVersion": "16.21.3",
    "generatedAt": "2026-10-28T04:15:38.997Z",  // 上游生成时间
    "crawledAt": "2026-10-29T08:00:00.000+08:00", // 本地抓取时间
    "crawledAtMs": 1793000000000,
    "championCount": 173,
    "augmentCount": 218,
    "itemCount": 306,
    "partial": false
  },
  "items": { "6655": "卢登的回声" },              // itemId -> 中文名
  "spells": { "4": "闪现" },                       // summonerSpellId -> 中文名
  "augments": {                                    // augmentId -> 强化字典
    "1373": {
      "name": "缩小引擎",
      "key": "ARAM_ShrinkEngine",
      "rarity": "gold",                            // silver | gold | prismatic
      "rarityLabel": "黄金",
      "description": "参与击杀后会让你变小并且获得技能急速和移动速度……",
      "stats": { "tier": "T1", "winRate": 0.5491, "pickRate": 0.2087 },  // winRate 可能为 null（样本不足）
      "topChampions": [{ "id": 17, "name": "提莫" }]
    }
  },
  "champions": {
    "17": {
      "id": 17,
      "alias": "Teemo",
      "name": "提莫",
      "title": "迅捷斥候",
      "roles": ["MAGE"],
      "icon": "https://…",
      "tier": "T1",
      "winRate": 0.5448,
      "pickRate": 0.1374,
      "rank": 1,                                    // 全服英雄排名（按胜率梯度）
      "augments": [                                 // 压缩数组：[augmentId, rank, tier, winRate, pickRate, games]，按 rank 升序
        [1373, 1, "T1", 0.5491, 0.2087, 1234]
      ],
      "builds": [
        {
          "label": "AP",                            // 流派标签（AP / Hybrid / Hybrid,On-Hit …）
          "tags": ["AP"],
          "winRate": 0.498,
          "pickRate": 0.629,
          "games": 4321,
          "combos": [                               // [[物品名...], winRate, pickRate, games]
            [["卢登的回声", "法师之靴", "风暴狂涌"], 0.5123, 0.087, 412]
          ],
          "situational": ["灭世者的死亡之帽"],
          "skillOrders": [{ "keys": "Q>E>W", "winRate": 0.51, "games": 900 }],
          "summoners": ["闪现", "引燃"]
        }
      ],
      "trios": [                                    // 三强化组合：[[augmentIds], winRate, games, pickRate]
        [[1373, 1401, 1290], 0.5634, 231, 0.031]
      ]
    }
  }
}
```

## 上游接口

| 用途 | 路径 |
| --- | --- |
| 配置（版本/清单地址） | `GET /api/client/v1/config` |
| 全站字典 | `GET /api/client/v1/data/<dataVersion>/augments.json`、`champions.json`、`items.json`、`summoner-spells.json` |
| 单英雄 | `GET /api/client/v1/data/<dataVersion>/champions/<championId>.json` |

字段要点（实测 dataVersion 16.21.3）：

- `augments.json`：`{resource,total:218,data:[{id,name,key,rarity,rarityName,rarityDisplayName,iconUrl,description,tooltip,statsAvailable,stats{tier,winRate,pickRate,games,wins,source,region,gamePatch,date},topChampions[{id,name,title,stats}],stages}]}`；`rarity` 为 `silver`(0)/`gold`(1)/`prismatic`(2)。`description` 含 `<scaleAF>`、`<attention>`、`<keyword>`、`<rules>`、`<br>` 轻标记，消费端需清洗（保留文字）。
- `champions.json`：`{total:173,data:[{id,alias,name,title,roles,iconUrl,stats{tier,winRate,pickRate,gamePatch,source,region}}]}`；**数组顺序即全服排名**（下标 + 1 = rank）。
- `champions/<id>.json`：`{dataVersion,championId,champion{...},augments[{id,name,rarity,iconUrl,stats{tier,winRate,pickRate,rank,total,games,wins}}],augmentTrios[{augmentIds[3],stats{games,wins,winRate,pickRate,gamePatch,date}}],build{...},builds[{...}],relatedBlogs[]}`。
- `build` / `builds[]`：`{patch,queueId:450,role,tier,tags{primary_tags_f3pie},stats{games,wins,pickRate,winRate,adjustedWinRate},summonerSpells[{summonerSpellIds[2],...}],skillOrders[{skillOrder[18],skillKeys[18],...}],coreItems[{itemIds[3],winRate,pickRate,games}],fullItems[],itemExtensions[],situationalItems[{id,...}],startingItems[{itemIds,...}]}`。
- 已知上游缺陷（2026-10-29 实测）：`augmentTrios` 里有 2 个未定义的 augmentId（2083、2104），消费端按「未知强化 #id」处理；约 7% 的单条强化 `winRate` 为 `null`（样本不足），不要渲染成 0%。

## 生成与刷新

```bash
node scripts/crawl.mjs            # 全量（带缓存，通常 1–5 秒命中缓存）
node scripts/crawl.mjs --limit 20 # 只抓前 20 个英雄，调试用
```

- 每页原始 JSON 缓存于 `lol-probe/cache/api/<sha1>.json`；删除缓存即强制重抓。
- 在线刷新（对话中）：`lol_update`（单英雄或整站字典），成功后写 `DSH_HOME/plugin-data/dsh-plugin-lol-mayhem/snapshot.json`。
