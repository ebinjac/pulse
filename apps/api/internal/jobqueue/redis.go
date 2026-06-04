package jobqueue

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	defaultQueueName     = "pulse:monitor-runs"
	defaultEnqueueDedup  = 55 * time.Second
	defaultRedisKeyspace = "pulse"
)

type RedisQueue struct {
	client          *redis.Client
	queueName       string
	keyspace        string
	enqueueDedupTTL time.Duration
}

func NewRedisQueue(redisURL string) (*RedisQueue, error) {
	options, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}

	return &RedisQueue{
		client:          redis.NewClient(options),
		queueName:       defaultQueueName,
		keyspace:        defaultRedisKeyspace,
		enqueueDedupTTL: defaultEnqueueDedup,
	}, nil
}

func (q *RedisQueue) Ping(ctx context.Context) error {
	return q.client.Ping(ctx).Err()
}

func (q *RedisQueue) EnqueueMonitorRun(ctx context.Context, job MonitorRunJob) (bool, error) {
	if job.EnqueuedAt.IsZero() {
		job.EnqueuedAt = time.Now().UTC()
	}
	if job.Trigger == "" {
		job.Trigger = "schedule"
	}

	key := q.enqueueDedupKey(enqueueDedupKey(job))
	acquired, err := q.client.SetNX(ctx, key, job.EnqueuedAt.Format(time.RFC3339Nano), q.enqueueDedupTTL).Result()
	if err != nil {
		return false, err
	}
	if !acquired {
		return false, nil
	}

	payload, err := json.Marshal(job)
	if err != nil {
		_ = q.client.Del(ctx, key).Err()
		return false, err
	}

	if err := q.client.RPush(ctx, q.queueName, payload).Err(); err != nil {
		_ = q.client.Del(ctx, key).Err()
		return false, err
	}

	return true, nil
}

func (q *RedisQueue) DequeueMonitorRun(ctx context.Context, timeout time.Duration) (MonitorRunJob, error) {
	result, err := q.client.BLPop(ctx, timeout, q.queueName).Result()
	if err == redis.Nil {
		return MonitorRunJob{}, ErrNoJob
	}
	if err != nil {
		return MonitorRunJob{}, err
	}
	if len(result) != 2 {
		return MonitorRunJob{}, fmt.Errorf("unexpected redis BLPOP result length %d", len(result))
	}

	var job MonitorRunJob
	if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
		return MonitorRunJob{}, err
	}
	return job, nil
}

func (q *RedisQueue) AcquireRunLock(ctx context.Context, monitorID string, ttl time.Duration) (Lock, bool, error) {
	token, err := randomToken()
	if err != nil {
		return nil, false, err
	}

	key := q.runLockKey(monitorID)
	acquired, err := q.client.SetNX(ctx, key, token, ttl).Result()
	if err != nil {
		return nil, false, err
	}
	if !acquired {
		return nil, false, nil
	}

	return redisLock{client: q.client, key: key, token: token}, true, nil
}

func (q *RedisQueue) Close() error {
	return q.client.Close()
}

func (q *RedisQueue) enqueueDedupKey(dedupKey string) string {
	return fmt.Sprintf("%s:enqueue-lock:%s", q.keyspace, dedupKey)
}

func (q *RedisQueue) runLockKey(monitorID string) string {
	return fmt.Sprintf("%s:run-lock:%s", q.keyspace, monitorID)
}

type redisLock struct {
	client *redis.Client
	key    string
	token  string
}

func (l redisLock) Release(ctx context.Context) error {
	const releaseScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`
	return l.client.Eval(ctx, releaseScript, []string{l.key}, l.token).Err()
}

func randomToken() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}
