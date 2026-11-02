# risk-board/

The risk board is integrated in `app/console/page.tsx`: calls ranked by predicted
window-miss probability, search, stage, vessel selection and SHAP details. Each
probability carries a ProvenanceBadge. Risk uses the latest observed prefix and
is explicitly fixed while operational events replay.
