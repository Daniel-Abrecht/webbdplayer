
typedef struct BD_MUTEX BD_MUTEX;

// No need for this in a single threaded application.
// The default stubs injected by js would work too, but those spam the logs.
int bd_mutex_init(BD_MUTEX *p){ return 0; }
int bd_mutex_destroy(BD_MUTEX *p){ return 0; }
int bd_mutex_lock(BD_MUTEX *p){ return 0; }
int bd_mutex_unlock(BD_MUTEX *p){ return 0; }

// The current verion of wasi-libc still needs this...
int main(void){}
