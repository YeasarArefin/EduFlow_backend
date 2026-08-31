export async function assignPlatformOwner(pool, userId) {
  const existing = await pool.query("SELECT id, user_id FROM platform_owners LIMIT 1");
  if (!existing.rowCount) {
    const inserted = await pool.query("INSERT INTO platform_owners (user_id) VALUES ($1) RETURNING id", [userId]);
    return { id: inserted.rows[0].id, previousUserId: null };
  }

  await pool.query("UPDATE platform_owners SET user_id = $1 WHERE id = $2", [userId, existing.rows[0].id]);
  return { id: existing.rows[0].id, previousUserId: existing.rows[0].user_id };
}

export async function restorePlatformOwner(pool, fixture) {
  if (fixture.previousUserId) {
    await pool.query("UPDATE platform_owners SET user_id = $1 WHERE id = $2", [fixture.previousUserId, fixture.id]);
    return;
  }

  await pool.query("DELETE FROM platform_owners WHERE id = $1", [fixture.id]);
}
