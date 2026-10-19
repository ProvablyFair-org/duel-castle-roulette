// Capture methodology, published for provenance/review.
// Reference record, not a runnable tool.
// Dataset in `data/`, hash-verified by the suite.
//
// The enrichment step. After the last round, the capture tool's save() matched every captured round
// to Duel's transactions API (GET /api/v2/user/transactions?type=roulette) by drand round id and the
// colour bet (or the only transaction on that drand round), and wrote these fields from the matched
// transaction: result.betId, result.txId, result.multiplier, result.amountCurrency (the stake,
// negative), result.amountWon (the amount of the bet's first related transaction, or '0' when the bet
// has none), result.serverSeed / serverSeedHash / drandRandomness (when the transaction carries them)
// and the timing block (betPlacedAt = the transaction's timestamp_raw). It then wrote meta.enrichment.
// Step 9 scores result.amountWon against result.amountCurrency on every win.
//
// The block below is that step's code, unchanged, as it sits in the capture tool recorded in
// castle-roulette-capture.reference.js, whose helpers it uses (openDB, dbGetAll, log, warn, good,
// drandPublishTime, meta). The dataset's fields and its meta.enrichment block have the shape it writes.

(function () {
  'use strict';
  var pub = {
    // Enrich + download: fetches authoritative bet timestamps from transactions API
    // and computes drand publish times locally. Produces delivery-ready dataset.
    save: function () {
      var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

      openDB().then(function () { return dbGetAll('rounds'); }).then(async function (rounds) {
        log('Enriching ' + rounds.length + ' rounds via transactions API...');

        // Step 1: walk transactions API, build drandRoundId → tx record(s)
        // Key difference from Crash: match by drand_round_id (no data.round_id field)
        // Multiple txs can share the same drand_round_id (multi-color bets)
        var drandIdMap = {}; // drandRoundId → [{betId, timestamp_raw, created_at, coin, roll, multiplier, ...}]
        var page = 1, lastPage = 1, apiCount = 0, pageErrors = 0;
        while (page <= lastPage && page <= 100 /* safety cap */) {
          try {
            // Do NOT use api() helper here — it unwraps j.data and loses pagination fields
            var rawResp = await fetch('/api/v2/user/transactions?page=' + page + '&per_page=100&type=roulette&grouped=1', { credentials: 'include', headers: { 'accept': 'application/json' } });
            var fullJson = await rawResp.json();
            if (!rawResp.ok || fullJson.success === false) throw new Error(fullJson.message || 'tx fetch failed');
            var txs = Array.isArray(fullJson.data) ? fullJson.data : [];
            lastPage = fullJson.last_page || lastPage;
            for (var i = 0; i < txs.length; i++) {
              var tx = txs[i];
              if (tx.key !== 'roulette_bets' || !tx.data || !tx.data.drand_round_id) continue;
              var dId = tx.data.drand_round_id;
              if (!drandIdMap[dId]) drandIdMap[dId] = [];
              drandIdMap[dId].push({
                betId: tx.data.id,
                txId: tx.id,
                timestamp_raw: tx.timestamp_raw,
                created_at: tx.date,
                coin: tx.data.coin,
                roll: tx.data.roll,
                multiplier: tx.data.multiplier,
                server_seed: tx.data.server_seed,
                server_hash: tx.data.server_hash,
                drand_randomness: tx.data.drand_randomness,
                delta: tx.delta,
                amount_currency: tx.amount_currency,
                related_transactions: tx.related_transactions || [],
              });
              apiCount++;
            }
            log('page ' + page + '/' + lastPage + ' — ' + apiCount + ' tx mapped');
            page++;
            await wait(300);
          } catch (e) {
            warn('page ' + page + ' failed: ' + e.message);
            pageErrors++;
            if (pageErrors >= 3) { warn('aborting transaction fetch after 3 errors'); break; }
            await wait(Math.pow(2, pageErrors) * 1000);
          }
        }

        // Step 2: enrich each round
        var enriched = 0, missing = 0, drandMissing = 0;
        for (var r = 0; r < rounds.length; r++) {
          var round = rounds[r];
          var drandId = round.result.drandRoundId;

          // Find matching tx by drand_round_id + coin
          var txList = drandId ? drandIdMap[drandId] : null;
          var matchedTx = null;
          if (txList) {
            // Match by coin (color) we bet on for this round
            matchedTx = txList.find(function (t) { return t.coin === round.request.coin; });
            // Fallback: take first if single tx
            if (!matchedTx && txList.length === 1) matchedTx = txList[0];
          }

          if (!matchedTx) {
            round.timing = { source: 'capture-only', note: 'no transaction-api record for drandRoundId ' + drandId };
            missing++;
            continue;
          }

          // Overwrite with authoritative data from tx API
          round.result.betId = matchedTx.betId;
          round.result.txId = matchedTx.txId;
          if (matchedTx.server_seed) round.result.serverSeed = matchedTx.server_seed;
          if (matchedTx.server_hash) round.result.serverSeedHash = matchedTx.server_hash;
          if (matchedTx.drand_randomness) round.result.drandRandomness = matchedTx.drand_randomness;
          round.result.multiplier = matchedTx.multiplier;
          round.result.amountCurrency = matchedTx.amount_currency;

          // Compute payout from related_transactions
          var payout = '0';
          if (matchedTx.related_transactions && matchedTx.related_transactions.length > 0) {
            var winTx = matchedTx.related_transactions[0];
            payout = winTx.amount_currency || String(winTx.delta_coins || winTx.delta || 0);
          }
          round.result.amountWon = payout;

          // drand publish time (local formula, no network)
          var drandAt = null, drandAtISO = null, commitGap = null;
          if (drandId) {
            drandAt    = drandPublishTime(drandId);
            drandAtISO = new Date(drandAt * 1000).toISOString();
            commitGap  = drandAt * 1000 - matchedTx.timestamp_raw;
          } else {
            drandMissing++;
          }

          round.timing = {
            drandPublishedAt:      drandAt,
            drandPublishedAtISO:   drandAtISO,
            commitmentBeforeDrand: commitGap,
            betPlacedAt:           matchedTx.timestamp_raw,
            betPlacedAtISO:        matchedTx.created_at,
            source:                'transactions-api',
          };
          enriched++;
        }

        log('enriched: ' + enriched + '/' + rounds.length + ' | missing: ' + missing + ' | no drandRoundId: ' + drandMissing);

        // Step 3: timing integrity summary
        var violations = 0;
        for (var k = 0; k < rounds.length; k++) {
          var t = rounds[k].timing;
          if (t && t.commitmentBeforeDrand != null && t.commitmentBeforeDrand <= 0) violations++;
        }
        if (violations > 0) warn('WARNING: ' + violations + ' rounds have commitmentBeforeDrand <= 0 (bet placed AFTER drand)');
        else good('TIMING OK: all rounds have bet placed before drand');

        // Step 4: download
        var data = {
          meta: {
            schema:      'duel-castle-roulette-capture',
            createdAt:   meta.createdAt,
            completedAt: new Date().toISOString(),
            enrichment: {
              totalRounds:         rounds.length,
              enriched:            enriched,
              missing:             missing,
              drandRoundMissing:   drandMissing,
              preCommitViolations: violations,
            },
          },
          rounds: rounds,
        };
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = 'castle-roulette-master-' + rounds.length + 'rounds.json';
        document.body.appendChild(a); a.click(); a.remove();
        good('saved — ' + rounds.length + ' rounds (enriched: ' + enriched + ')');
      });
    },
  };
});

console.log('[cr] enrichment reference record loaded — see data/ for the captured dataset');
